import { ipcMain } from 'electron';
import { ok, fail } from '@memoflow/contracts/result';
import {
  ProfileAccessChannels,
  type DesktopAccessSnapshot,
  type ProfileSummary,
  type RemoveProfileRequest,
  type SelectProfileRequest,
} from '@memoflow/contracts/electron';
import type { ProfileRegistry } from './profile-registry';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import type { DesktopCloudConnectionManager } from './desktop-cloud-connection-manager';
import type { DeviceAuthCoordinator } from './device-auth-coordinator';

async function toSummary(
  profile: Awaited<ReturnType<ProfileRegistry['list']>>[number],
  runtime: DesktopProfileRuntimeManager,
): Promise<ProfileSummary> {
  return {
    profileId: profile.profileId,
    profileKind: profile.profileKind,
    displayName: profile.displayName,
    avatarSeed: profile.avatarSeed,
    identifierHint: profile.identifier,
    cloudAccountId: profile.cloudBinding?.cloudAccountId ?? null,
    lastActiveAt: profile.lastActiveAt,
    hasPin: await runtime.hasPin(profile.profileId),
  };
}

export function registerProfileAccessIpc(
  registry: ProfileRegistry,
  runtime: DesktopProfileRuntimeManager,
  cloudConnection: DesktopCloudConnectionManager,
  deviceAuth?: DeviceAuthCoordinator,
): void {
  const readSnapshot = async (): Promise<DesktopAccessSnapshot> => {
    const descriptor = runtime.getActiveProfileDescriptorSync();
    const [cloudState, profile] = await Promise.all([
      cloudConnection.getState(descriptor),
      descriptor ? toSummary(descriptor, runtime) : null,
    ]);
    const stillActive =
      descriptor !== null && runtime.getActiveProfileDescriptorSync() === descriptor;
    const online = stillActive && cloudState === 'ONLINE';
    return {
      profile: stillActive ? profile : null,
      unlockState: stillActive ? 'UNLOCKED' : 'LOCKED',
      cloudState: stillActive ? cloudState : 'UNBOUND',
      capabilities: {
        local: stillActive,
        sync: online,
        cloudAi: online,
        repositoryConnection: online,
      },
    };
  };
  ipcMain.handle(ProfileAccessChannels.GET_SNAPSHOT, async () => ok(await readSnapshot()));
  ipcMain.handle(ProfileAccessChannels.REFRESH_CLOUD_STATE, async () => {
    const descriptor = runtime.getActiveProfileDescriptorSync();
    if (descriptor) await cloudConnection.restore(descriptor);
    return ok(await readSnapshot());
  });

  ipcMain.handle(ProfileAccessChannels.LIST, async () =>
    ok(await Promise.all((await registry.list()).map((profile) => toSummary(profile, runtime)))),
  );

  ipcMain.handle(
    ProfileAccessChannels.SELECT,
    async (_event, input: string | SelectProfileRequest) => {
      if (deviceAuth) {
        const activeProfileId = runtime.getActiveProfileId();
        if (activeProfileId) deviceAuth.cancelForProfile(activeProfileId);
      }
      const profileId = typeof input === 'string' ? input : input.profileId;
      const profile = (await registry.list()).find((entry) => entry.profileId === profileId);
      if (!profile) return fail({ code: 'PROFILE_NOT_FOUND', message: 'Profile not found' });
      const pinRequired = await runtime.hasPin(profileId);
      const pin = typeof input === 'string' ? undefined : input.pin;
      if (pinRequired && !pin) {
        return fail({ code: 'PIN_REQUIRED', message: '此 Profile 需要本地 PIN 解锁' });
      }
      if (pinRequired && pin) await runtime.preparePinUnlock(profileId, pin);
      if (profile.profileKind === 'guest') {
        await runtime.prepareGuestProfile();
      } else {
        await runtime.prepareProfile(profile.localOwnerId, {
          displayName: profile.displayName,
          identifier: profile.identifier,
        });
      }
      await runtime.activatePreparedProfile();
      return ok(null);
    },
  );

  ipcMain.handle(ProfileAccessChannels.REMOVE, async (_event, input: RemoveProfileRequest) => {
    if (runtime.getActiveProfileId() === input.profileId) {
      return fail({ code: 'PROFILE_ACTIVE', message: '请先锁定或切换当前 Profile' });
    }
    deviceAuth?.cancelForProfile(input.profileId);
    await runtime.removeProfile(input.profileId);
    return ok(null);
  });

  ipcMain.handle(ProfileAccessChannels.LOCK, async () => {
    if (deviceAuth) {
      const profileId = runtime.getActiveProfileId();
      if (profileId) deviceAuth.cancelForProfile(profileId);
    }
    await runtime.deactivateProfile();
    return ok(null);
  });

  ipcMain.handle(ProfileAccessChannels.PIN_SET, async (_event, pin: string) => {
    await runtime.setCurrentProfilePin(pin);
    return ok(null);
  });

  ipcMain.handle(ProfileAccessChannels.PIN_REMOVE, async () => {
    await runtime.removeCurrentProfilePin();
    return ok(null);
  });
}
