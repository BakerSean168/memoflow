import { ipcMain } from 'electron';
import {
  DesktopCloudConnectionRequestSchema,
  DesktopCloudAttemptRequestSchema,
  type CloudSessionState,
} from '@memoflow/contracts';
import { CloudAuthChannels } from '@memoflow/contracts/electron';
import { fail, ok } from '@memoflow/contracts/result';
import { getApiBaseUrl } from '../utils/api-config';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import type { DeviceAuthCoordinator } from './device-auth-coordinator';
import type { ProfileRegistry } from './profile-registry';
import type { CloudSessionStore } from './cloud-session-store';

function authOrigin(): string {
  return new URL(getApiBaseUrl()).origin;
}

export function registerCloudAuthIpc(
  _registry: ProfileRegistry,
  runtime: DesktopProfileRuntimeManager,
  sessions: CloudSessionStore,
  cloudConnection?: DeviceAuthCoordinator,
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
        const stored = await sessions.load(profile.profileId);
        if (stored) {
          await fetch(`${authOrigin()}/api/auth/sign-out`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${stored.token}`,
            },
            body: '{}',
            signal: AbortSignal.timeout(10_000),
          }).catch(() => undefined);
        }
        await sessions.remove(profile.profileId);
        await runtime.disableCloudSync();
        cloudConnection?.clearForProfile(profile.profileId);
      }
      return ok(undefined);
    });
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
