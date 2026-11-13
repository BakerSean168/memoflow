import { ipcMain } from 'electron';
import {
  AccountSecurityRequestSchema,
  DesktopCloudConnectionRequestSchema,
  DesktopCloudAttemptRequestSchema,
  DesktopCloudCredentialSignInSchema,
  DesktopCloudGithubSignInSchema,
  DesktopCloudRegistrationSchema,
  type CloudSessionState,
} from '@memoflow/cloud-auth-contracts';
import { CloudAuthChannels } from '@memoflow/desktop-contracts';
import { fail, ok, ResultErrorException } from '@memoflow/transport-contracts/result';
import { getApiBaseUrl } from '../utils/api-config';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import type { DeviceAuthCoordinator } from './device-auth-coordinator';
import type { ProfileRegistry } from './profile-registry';
import type { DesktopCloudConnectionManager } from './desktop-cloud-connection-manager';
import type { CloudSessionStore } from './cloud-session-store';
import type { DesktopCloudSignInService } from './desktop-cloud-sign-in-service';
import { suppressProfileAutoEnterForLaunch } from './profile-auto-enter-suppression';

function authOrigin(): string {
  return new URL(getApiBaseUrl()).origin;
}

export function registerCloudAuthIpc(
  _registry: ProfileRegistry,
  runtime: DesktopProfileRuntimeManager,
  sessions: CloudSessionStore,
  cloudChecks: Pick<DesktopCloudConnectionManager, 'clearSession'>,
  cloudConnection?: DeviceAuthCoordinator,
  signIn?: DesktopCloudSignInService,
): void {
  ipcMain.handle(CloudAuthChannels.ACCOUNT_SECURITY, async (_event, input: unknown) => {
    const parsed = AccountSecurityRequestSchema.safeParse(input);
    if (!parsed.success) return fail({ code: 'INVALID_REQUEST', message: '账户安全请求无效' });
    const origin = runtime.getActiveProfileDescriptorSync()?.profileId;
    const request = parsed.data;
    async function send(profileId: string) {
      const stored = await sessions.load(profileId);
      if (!stored) throw new ResultErrorException('请重新登录云账户', 'UNAUTHORIZED');
      const { action, ...body } = request;
      const path = `/account-security/${action}`;
      const response = await fetch(`${authOrigin()}/api/auth${path}`, {
        method: action === 'sessions' ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          origin: authOrigin(),
          authorization: `Bearer ${stored.token}`,
        },
        body: action === 'sessions' ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = (await response.json()) as { code?: string; message?: string };
      if (!response.ok)
        throw new ResultErrorException(
          payload.message ?? '账户安全操作失败',
          payload.code ?? 'ACCOUNT_SECURITY_FAILED',
        );
      return payload;
    }
    try {
      if (request.action === 'delete-account') {
        await runtime.signOutActiveProfile(async (profile) => {
          if (profile.profileId !== origin || profile.profileKind !== 'registered')
            throw new ResultErrorException('云账户已切换', 'PROFILE_CHANGED');
          await send(profile.profileId);
          cloudConnection?.cancelForProfile(profile.profileId);
          await cloudChecks.clearSession(profile.profileId);
        });
        return ok(null);
      }
      return await runtime.runExclusive(async () => {
        const profile = runtime.getActiveProfileDescriptorSync();
        if (!profile || profile.profileId !== origin || profile.profileKind !== 'registered')
          return fail({ code: 'PROFILE_CHANGED', message: '请在当前云账户重试' });
        return ok(await send(profile.profileId));
      });
    } catch (error) {
      return fail({
        code: error instanceof ResultErrorException ? error.code : 'ACCOUNT_SECURITY_FAILED',
        message: error instanceof Error ? error.message : '账户安全操作失败',
      });
    }
  });

  ipcMain.handle(CloudAuthChannels.SESSION, async () => {
    const origin = runtime.getActiveProfileDescriptorSync()?.profileId;
    return runtime.runExclusive(async () => {
      const profile = runtime.getActiveProfileDescriptorSync();
      if (profile?.profileId !== origin)
        return ok<CloudSessionState>({ account: null, session: null });
      if (!profile) return ok<CloudSessionState>({ account: null, session: null });
      const stored = await sessions.load(profile.profileId);
      if (!stored || stored.account.id !== profile.cloudBinding?.cloudAccountId)
        return ok<CloudSessionState>({ account: null, session: null });
      const session =
        Date.parse(stored.expiresAt) > Date.now()
          ? { id: stored.sessionId, expiresAt: stored.expiresAt }
          : null;
      return ok<CloudSessionState>({ account: stored.account, session });
    });
  });

  /**
   * Invalidate the cloud side of one Profile and drop the local session file.
   *
   * The bearer call is deliberately fire-and-forget with a 10s ceiling: a
   * network failure must never block the local sign-out that follows.
   */
  const disconnectCloudSession = async (profileId: string): Promise<void> => {
    cloudConnection?.clearForProfile(profileId);
    const stored = await cloudChecks.clearSession(profileId);
    if (!stored) return;
    void fetch(`${authOrigin()}/api/auth/sign-out`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: authOrigin(),
        authorization: `Bearer ${stored.token}`,
      },
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
  };

  ipcMain.handle(CloudAuthChannels.SIGN_OUT, async () => {
    const origin = runtime.getActiveProfileDescriptorSync()?.profileId;
    return runtime.runExclusive(async () => {
      const profile = runtime.getActiveProfileDescriptorSync();
      if (profile?.profileId !== origin)
        return fail({ code: 'PROFILE_CHANGED', message: 'Profile 已切换，请在当前 Profile 重试' });
      if (profile) await disconnectCloudSession(profile.profileId);
      return ok(undefined);
    });
  });

  ipcMain.handle(CloudAuthChannels.SIGN_OUT_ACCOUNT, async () => {
    // Issue #926: signing out returns to the identity gate, and this launch must
    // not answer that return by entering an account again. The marker is memory
    // only, so the next launch still honours the stored preference.
    suppressProfileAutoEnterForLaunch();
    try {
      await runtime.signOutActiveProfile(async (descriptor) => {
        // A pending device-code attempt belongs to the account being removed.
        cloudConnection?.cancelForProfile(descriptor.profileId);
        if (descriptor.profileKind === 'registered')
          await disconnectCloudSession(descriptor.profileId);
      });
      return ok(null);
    } catch (error) {
      return fail({
        code: error instanceof ResultErrorException ? error.code : 'SIGN_OUT_FAILED',
        message: error instanceof Error ? error.message : '退出账号失败',
      });
    }
  });

  ipcMain.handle(CloudAuthChannels.SIGN_IN, async (_event, input: unknown) => {
    const parsed = DesktopCloudCredentialSignInSchema.safeParse(input);
    if (!parsed.success) return fail({ code: 'INVALID_REQUEST', message: '登录信息无效' });
    return signIn
      ? signIn.signIn(parsed.data)
      : fail({ code: 'CLOUD_AUTH_UNAVAILABLE', message: '云端登录尚未初始化' });
  });

  ipcMain.handle(CloudAuthChannels.SIGN_UP, async (_event, input: unknown) => {
    const parsed = DesktopCloudRegistrationSchema.safeParse(input);
    if (!parsed.success) return fail({ code: 'INVALID_REQUEST', message: '注册信息无效' });
    return signIn
      ? signIn.signUp(parsed.data)
      : fail({ code: 'CLOUD_AUTH_UNAVAILABLE', message: '云端登录尚未初始化' });
  });

  ipcMain.handle(CloudAuthChannels.FORGOT_PASSWORD, async () =>
    signIn
      ? signIn.openPasswordRecovery()
      : fail({ code: 'CLOUD_AUTH_UNAVAILABLE', message: '云端登录尚未初始化' }),
  );

  ipcMain.handle(CloudAuthChannels.GITHUB_SIGN_IN_BEGIN, async (_event, input: unknown) => {
    const parsed = DesktopCloudGithubSignInSchema.safeParse(input);
    if (!parsed.success) return fail({ code: 'INVALID_REQUEST', message: '登录信息无效' });
    return cloudConnection
      ? cloudConnection.beginWithoutProfile(parsed.data)
      : fail({ code: 'CLOUD_CONNECTION_UNAVAILABLE', message: '云端连接尚未初始化' });
  });

  ipcMain.handle(CloudAuthChannels.CLOUD_CONNECTION_BEGIN, async (_event, input: unknown) => {
    const parsed = DesktopCloudConnectionRequestSchema.safeParse(input);
    if (!parsed.success) return fail({ code: 'INVALID_REQUEST', message: '认证意图无效' });
    return cloudConnection
      ? cloudConnection.begin(parsed.data)
      : fail({ code: 'CLOUD_CONNECTION_UNAVAILABLE', message: '云端连接尚未初始化' });
  });
  ipcMain.handle(CloudAuthChannels.CLOUD_CONNECTION_CURRENT, async () =>
    cloudConnection
      ? cloudConnection.getCurrent()
      : fail({ code: 'CLOUD_CONNECTION_UNAVAILABLE', message: '云端连接尚未初始化' }),
  );
  for (const channel of [
    CloudAuthChannels.CLOUD_CONNECTION_STATUS,
    CloudAuthChannels.CLOUD_CONNECTION_CANCEL,
  ]) {
    ipcMain.handle(channel, async (_event, input: unknown) => {
      const parsed = DesktopCloudAttemptRequestSchema.safeParse(input);
      if (!parsed.success) return fail({ code: 'INVALID_REQUEST', message: '认证请求 ID 无效' });
      if (!cloudConnection)
        return fail({ code: 'CLOUD_CONNECTION_UNAVAILABLE', message: '云端连接尚未初始化' });
      return channel === CloudAuthChannels.CLOUD_CONNECTION_STATUS
        ? cloudConnection.getStatus(parsed.data.attemptId)
        : cloudConnection.cancel(parsed.data.attemptId);
    });
  }
}
