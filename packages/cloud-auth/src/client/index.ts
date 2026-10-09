import type {
  CloudAuthClientPort,
  CloudAuthDesktopClientPort,
  CloudAuthWebClientPort,
  CloudAuthResponse,
  DesktopCloudConnectionAttempt,
  CloudSessionState,
  CloudSignInRequest,
  CloudSignUpRequest,
} from '@memoflow/contracts';
export type {
  CloudAuthClientPort,
  CloudAuthDesktopClientPort,
  CloudAuthWebClientPort,
} from '@memoflow/contracts';
import { fail, ok, type Result } from '@memoflow/contracts/result';
import { CloudAuthChannels } from '@memoflow/contracts/electron';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { mapBetterAuthFailure } from './adapters/better-auth-error-mapper.js';

interface BetterAuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

interface BetterAuthSession {
  id: string;
  expiresAt: string | Date;
}

interface BetterAuthSignInResponse {
  token: string | null;
  user: BetterAuthUser;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
}

function account(user: BetterAuthUser) {
  return { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified };
}

class CloudAuthHttpClient implements CloudAuthWebClientPort {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, body?: unknown): Promise<Result<T>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'include',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as
        | T
        | {
            code?: string;
            message?: string;
            error?: string;
            error_description?: string;
          }
        | null;
      if (!response.ok) {
        return fail(mapBetterAuthFailure(payload, response.status));
      }
      return ok(payload as T);
    } catch (cause) {
      return fail({ code: 'NETWORK_ERROR', message: '无法连接认证服务器', cause });
    }
  }

  async signIn(request: CloudSignInRequest): Promise<Result<CloudAuthResponse>> {
    const result = await this.request<BetterAuthSignInResponse>('/sign-in/email', request);
    if (!result.ok) return result;
    const session = result.data.token ? await this.getSession() : null;
    if (session && !session.ok) return session;
    return ok({
      account: account(result.data.user),
      session: session?.data.session ?? null,
      requiresEmailVerification: !result.data.token,
    });
  }

  async signUp(request: CloudSignUpRequest): Promise<Result<CloudAuthResponse>> {
    const result = await this.request<BetterAuthSignInResponse>('/sign-up/email', {
      ...request,
      name: request.name ?? request.email.split('@')[0],
      callbackURL: this.webCallbackUrl('/auth'),
    });
    if (!result.ok) return result;
    const session = result.data.token ? await this.getSession() : null;
    if (session && !session.ok) return session;
    return ok({
      account: account(result.data.user),
      session: session?.data.session ?? null,
      requiresEmailVerification: !result.data.token,
    });
  }

  signOut() {
    return this.request<void>('/sign-out', {});
  }

  async getSession(): Promise<Result<CloudSessionState>> {
    const result = await this.request<{ user: BetterAuthUser; session: BetterAuthSession } | null>(
      '/get-session',
    );
    if (!result.ok) return result;
    if (!result.data) return ok({ account: null, session: null });
    return ok({
      account: account(result.data.user),
      session: {
        id: result.data.session.id,
        expiresAt: new Date(result.data.session.expiresAt).toISOString(),
      },
    });
  }

  forgotPassword(email: string) {
    return this.request<void>('/request-password-reset', {
      email,
      redirectTo: this.webCallbackUrl('/auth?scene=reset'),
    });
  }
  resetPassword(input: { token: string; newPassword: string }) {
    return this.request<void>('/reset-password', input);
  }
  changePassword(input: { currentPassword: string; newPassword: string }) {
    return this.request<void>('/change-password', input);
  }
  beginGithubSignIn(callbackURL = '/') {
    return this.request<{ url: string }>('/sign-in/social', { provider: 'github', callbackURL });
  }
  getDeviceAuthorization(userCode: string) {
    return this.request<{ user_code: string; status: 'pending' | 'approved' | 'denied' }>(
      `/device?user_code=${encodeURIComponent(userCode)}`,
    ).then((result) =>
      result.ok ? ok({ userCode: result.data.user_code, status: result.data.status }) : result,
    );
  }
  approveDeviceAuthorization(userCode: string) {
    return this.request<{ success: boolean }>('/device/approve', { userCode }).then((result) =>
      result.ok ? ok(undefined) : result,
    );
  }
  denyDeviceAuthorization(userCode: string) {
    return this.request<{ success: boolean }>('/device/deny', { userCode }).then((result) =>
      result.ok ? ok(undefined) : result,
    );
  }

  private webCallbackUrl(path: string): string {
    return typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString();
  }
}

class CloudAuthIpcClient implements CloudAuthDesktopClientPort {
  constructor(private readonly ipc: IResultIpcClient) {}
  signOut() {
    return this.ipc.invoke<void>(CloudAuthChannels.SIGN_OUT);
  }
  getSession() {
    return this.ipc.invoke<CloudSessionState>(CloudAuthChannels.SESSION);
  }
  beginCloudConnection(request: import('@memoflow/contracts').DesktopCloudConnectionRequest) {
    return this.ipc.invoke<DesktopCloudConnectionAttempt>(
      CloudAuthChannels.CLOUD_CONNECTION_BEGIN,
      request,
    );
  }
  getCurrentCloudConnection() {
    return this.ipc.invoke<DesktopCloudConnectionAttempt | null>(
      CloudAuthChannels.CLOUD_CONNECTION_CURRENT,
    );
  }
  getCloudConnectionStatus(attemptId: string) {
    return this.ipc.invoke<DesktopCloudConnectionAttempt>(
      CloudAuthChannels.CLOUD_CONNECTION_STATUS,
      { attemptId },
    );
  }
  cancelCloudConnection(attemptId: string) {
    return this.ipc.invoke<void>(CloudAuthChannels.CLOUD_CONNECTION_CANCEL, { attemptId });
  }
}

export function createCloudAuthHttpClient(
  _httpClient?: IResultHttpClient,
  options?: { baseUrl?: string },
): CloudAuthWebClientPort {
  const configured =
    options?.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return new CloudAuthHttpClient(normalizeBaseUrl(configured));
}

export function createCloudAuthIpcClient(ipcClient: IResultIpcClient): CloudAuthDesktopClientPort {
  return new CloudAuthIpcClient(ipcClient);
}
