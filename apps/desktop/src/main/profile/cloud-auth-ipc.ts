import { ipcMain } from 'electron';
import {
  DesktopCloudConnectionRequestSchema,
  DesktopCloudAttemptRequestSchema,
  DesktopCloudCredentialSignInSchema,
  DesktopCloudGithubSignInSchema,
  DesktopCloudRegistrationSchema,
  type CloudSessionState,
} from '@memoflow/cloud-auth-contracts';
import { CloudAuthChannels } from '@memoflow/desktop-contracts';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { getApiBaseUrl } from '../utils/api-config';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import type { DeviceAuthCoordinator } from './device-auth-coordinator';
import type { ProfileRegistry } from './profile-registry';
import type { DesktopCloudConnectionManager } from './desktop-cloud-connection-manager';
import type { CloudSessionStore } from './cloud-session-store';
import type { DesktopCloudSignInService } from './desktop-cloud-sign-in-service';

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

  ipcMain.handle(CloudAuthChannels.SIGN_OUT, async () => {
    const origin = runtime.getActiveProfileDescriptorSync()?.profileId;
    return runtime.runExclusive(async () => {
      const profile = runtime.getActiveProfileDescriptorSync();
      if (profile?.profileId !== origin)
        return fail({ code: 'PROFILE_CHANGED', message: 'Profile 已切换，请在当前 Profile 重试' });
      if (profile) {
        cloudConnection?.clearForProfile(profile.profileId);
        const stored = await cloudChecks.clearSession(profile.profileId);
        if (stored) {
          void fetch(`${authOrigin()}/api/auth/sign-out`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${stored.token}`,
            },
            body: '{}',
            signal: AbortSignal.timeout(10_000),
          }).catch(() => undefined);
        }
      }
      return ok(undefined);
    });
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
