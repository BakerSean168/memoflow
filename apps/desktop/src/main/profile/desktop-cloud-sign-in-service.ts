import { shell } from 'electron';
import {
  BetterAuthSessionResponseSchema,
  type CloudAuthResponse,
  type DesktopCloudCredentialSignIn,
  type DesktopCloudRegistration,
  type DesktopCloudSignInResult,
} from '@memoflow/cloud-auth-contracts';
import { mapBetterAuthFailure } from '@memoflow/cloud-auth';
import { fail, ok, type Result } from '@memoflow/transport-contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { getApiBaseUrl } from '../utils/api-config';
import type { CloudSessionStore, StoredCloudSession } from './cloud-session-store';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import { markProfileImportOpportunity } from './profile-import-opportunity';

const logger = createLogger('DesktopCloudSignInService');

interface BetterAuthSignInResponse {
  token?: string | null;
  user?: { id: string; email: string; name: string; emailVerified?: boolean };
}

export interface DesktopCloudSignInServiceOptions {
  fetchImpl?: typeof fetch;
  openExternal?: (url: string) => Promise<unknown>;
}

function authOrigin(): string {
  return new URL(getApiBaseUrl()).origin;
}

/**
 * Cloud sign-in from the identity window, where no Profile is active yet.
 *
 * The renderer only ever sends credentials; this service talks to the cloud
 * authentication API in the main process, adopts the session under the
 * registered Profile it finds or creates, and opens that Profile. Passwords
 * never leave this call frame: they are not stored, not logged, and not
 * forwarded to the renderer.
 */
export class DesktopCloudSignInService {
  private readonly fetchImpl: typeof fetch;
  private readonly openExternal: (url: string) => Promise<unknown>;

  constructor(
    private readonly runtime: DesktopProfileRuntimeManager,
    private readonly sessions: CloudSessionStore,
    options: DesktopCloudSignInServiceOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.openExternal = options.openExternal ?? ((url) => shell.openExternal(url));
  }

  async signIn(input: DesktopCloudCredentialSignIn): Promise<Result<DesktopCloudSignInResult>> {
    const signedIn = await this.post<BetterAuthSignInResponse>('/sign-in/email', {
      email: input.email,
      password: input.password,
    });
    if (!signedIn.ok) return signedIn;
    const adopted = await this.adoptCredentialResponse(signedIn.data, input.remember);
    return adopted;
  }

  async signUp(input: DesktopCloudRegistration): Promise<Result<DesktopCloudSignInResult>> {
    const registered = await this.post<BetterAuthSignInResponse>('/sign-up/email', {
      email: input.email,
      password: input.password,
      name: input.name?.trim() || input.email.split('@')[0],
    });
    if (!registered.ok) return registered;
    return this.adoptCredentialResponse(registered.data, input.remember);
  }

  /**
   * The device-authorization flow (including its GitHub button) ends here too:
   * a resolved cloud identity is registered or found and its Profile opened.
   */
  adopt(
    auth: CloudAuthResponse,
    token: string,
    remember: boolean,
  ): Promise<Result<DesktopCloudSignInResult>> {
    if (!auth.session || Date.parse(auth.session.expiresAt) <= Date.now() || !token)
      return Promise.resolve(fail({ code: 'AUTH_RESPONSE_INVALID', message: '云端认证响应无效' }));
    return this.adoptSession(
      {
        token,
        sessionId: auth.session.id,
        account: auth.account,
        expiresAt: auth.session.expiresAt,
      },
      remember,
    );
  }

  async openPasswordRecovery(): Promise<Result<void>> {
    try {
      // The Web app owns the recovery form; the desktop only opens the page.
      await this.openExternal(`${authOrigin()}/auth?scene=forgot`);
      return ok(undefined);
    } catch (cause) {
      return fail({ code: 'EXTERNAL_OPEN_FAILED', message: '无法打开浏览器', cause });
    }
  }

  private async adoptCredentialResponse(
    payload: BetterAuthSignInResponse,
    remember: boolean,
  ): Promise<Result<DesktopCloudSignInResult>> {
    if (!payload.token) {
      // The server requires a verified email before it issues a session.
      return fail({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: '请打开验证邮件完成邮箱验证',
      });
    }
    const session = await this.readSession(payload.token);
    if (!session.ok) {
      await this.revoke(payload.token);
      return session;
    }
    return this.adoptSession(
      {
        token: payload.token,
        sessionId: session.data.session.id,
        account: session.data.account,
        expiresAt: session.data.session.expiresAt,
      },
      remember,
    );
  }

  private async adoptSession(
    stored: StoredCloudSession,
    remember: boolean,
  ): Promise<Result<DesktopCloudSignInResult>> {
    let profileId: string;
    let isNewTarget = false;
    try {
      // Same test as the anchored connection flow: the cloud account has no
      // registered Profile yet, so this adoption creates one.
      isNewTarget = !(await this.runtime.listProfiles()).some(
        (profile) => profile.cloudBinding?.cloudAccountId === stored.account.id,
      );
      const target = await this.runtime.registerCloudProfile(
        stored.account.id,
        stored.account.name || stored.account.email,
        stored.account.email,
      );
      profileId = target.profileId;
    } catch (cause) {
      await this.revoke(stored.token);
      return fail({
        code: 'PROFILE_REGISTRATION_FAILED',
        message: '无法为该云账号创建 Profile',
        cause,
      });
    }

    // "Remember me" is the disk copy. A failure to write it is not a silent
    // downgrade: the login is rolled back so the user can retry without it.
    try {
      await this.sessions.save(profileId, stored, { persist: remember });
    } catch (cause) {
      await this.sessions.remove(profileId);
      await this.revoke(stored.token);
      return fail({
        code: 'SESSION_PERSIST_FAILED',
        message: '无法保存登录状态，请检查本机安全存储后重试',
        cause,
      });
    }

    // A newly adopted cloud Profile gets the same one-shot import invitation
    // the anchored connection flow leaves; the identity window has no source
    // Profile, so the prompt offers every eligible local account.
    if (isNewTarget) {
      try {
        await markProfileImportOpportunity(
          this.runtime.getSharedResolver().roots.dataRoot,
          profileId,
          null,
        );
      } catch (cause) {
        // The optional invitation must never change a committed sign-in.
        logger.warn('Cloud sign-in could not record the import opportunity', {
          profileId,
          reason: cause instanceof Error ? cause.message : 'unknown',
        });
      }
    }

    try {
      await this.runtime.openProfile(profileId);
    } catch (cause) {
      await this.sessions.remove(profileId);
      await this.revoke(stored.token);
      logger.warn('Cloud sign-in could not open the registered Profile', {
        profileId,
        reason: cause instanceof Error ? cause.message : 'unknown',
      });
      return fail({ code: 'PROFILE_OPEN_FAILED', message: '无法打开该 Profile', cause });
    }
    return ok({ profileId });
  }

  private async post<T>(path: string, body: unknown): Promise<Result<T>> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${authOrigin()}/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: authOrigin() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (cause) {
      return fail({ code: 'NETWORK_ERROR', message: '无法连接认证服务器', cause });
    }
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) return fail(mapBetterAuthFailure(payload, response.status));
    return ok(payload as T);
  }

  private async readSession(
    token: string,
  ): Promise<
    Result<{ account: StoredCloudSession['account']; session: { id: string; expiresAt: string } }>
  > {
    let response: Response;
    try {
      response = await this.fetchImpl(`${authOrigin()}/api/auth/get-session`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (cause) {
      return fail({ code: 'NETWORK_ERROR', message: '无法连接认证服务器', cause });
    }
    if (!response.ok) {
      return fail(mapBetterAuthFailure(await response.json().catch(() => null), response.status));
    }
    const parsed = BetterAuthSessionResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success)
      return fail({ code: 'AUTH_RESPONSE_INVALID', message: '云端认证响应无效' });
    return ok({
      account: {
        id: parsed.data.user.id,
        email: parsed.data.user.email,
        name: parsed.data.user.name,
        emailVerified: parsed.data.user.emailVerified === true,
      },
      session: {
        id: parsed.data.session.id,
        expiresAt: new Date(parsed.data.session.expiresAt).toISOString(),
      },
    });
  }

  private async revoke(token: string): Promise<void> {
    await this.fetchImpl(`${authOrigin()}/api/auth/sign-out`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
  }
}
