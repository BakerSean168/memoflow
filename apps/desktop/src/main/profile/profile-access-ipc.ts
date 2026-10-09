import { ipcMain } from 'electron';
import { ok, fail } from '@memoflow/contracts/result';
import {
  ProfileAccessChannels,
  type DesktopAccessSnapshot,
  type ProfileSummary,
  SelectProfileRequestSchema,
  RemoveProfileRequestSchema,
  CreateGuestProfileRequestSchema,
  RenameProfileRequestSchema,
  ProfilePinSchema,
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
  ipcMain.handle(ProfileAccessChannels.GET_SNAPSHOT, async () =>
    runtime.runExclusive(async () => {
      const descriptor = runtime.getActiveProfileDescriptorSync();
      const cloudState = await cloudConnection.getState(descriptor);
      const snapshot: DesktopAccessSnapshot = {
        profile: descriptor ? await toSummary(descriptor, runtime) : null,
        unlockState: descriptor ? 'UNLOCKED' : 'LOCKED',
        cloudState,
        capabilities: {
          local: descriptor !== null,
          sync: cloudState === 'ONLINE',
          cloudAi: cloudState === 'ONLINE',
          repositoryConnection: cloudState === 'ONLINE',
        },
      };
      return ok(snapshot);
    }),
  );

  ipcMain.handle(ProfileAccessChannels.LIST, async () =>
    ok(await Promise.all((await registry.list()).map((profile) => toSummary(profile, runtime)))),
  );

  ipcMain.handle(ProfileAccessChannels.CREATE_GUEST, async (_event, input: unknown) => {
    const parsed = CreateGuestProfileRequestSchema.safeParse(input);
    if (!parsed.success)
      return fail({
        code: 'INVALID_REQUEST',
        message: '请输入 1–80 字的 Profile 名称和有效请求 ID',
      });
    const profile = await runtime.createGuestProfile(
      parsed.data.requestId,
      parsed.data.displayName,
    );
    return ok(await toSummary(profile, runtime));
  });

  ipcMain.handle(ProfileAccessChannels.RENAME, async (_event, input: unknown) => {
    const parsed = RenameProfileRequestSchema.safeParse(input);
    if (!parsed.success)
      return fail({ code: 'INVALID_REQUEST', message: '请输入 1–80 字的 Profile 名称' });
    await runtime.updateProfileDisplayName(parsed.data.profileId, parsed.data.displayName);
    return ok(null);
  });

  ipcMain.handle(ProfileAccessChannels.SELECT, async (_event, input: unknown) => {
    const parsed = SelectProfileRequestSchema.safeParse(input);
    if (!parsed.success)
      return fail({ code: 'INVALID_REQUEST', message: 'Profile 或 PIN 格式无效' });
    const activeProfileId = runtime.getActiveProfileId();
    if (activeProfileId) deviceAuth?.cancelForProfile(activeProfileId);
    try {
      await runtime.openProfile(parsed.data.profileId, parsed.data.pin);
      return ok(null);
    } catch (error) {
      return fail({
        code: 'PROFILE_OPEN_FAILED',
        message: error instanceof Error ? error.message : '无法打开 Profile',
      });
    }
  });

  ipcMain.handle(ProfileAccessChannels.REMOVE, async (_event, input: unknown) => {
    const parsed = RemoveProfileRequestSchema.safeParse(input);
    if (!parsed.success) return fail({ code: 'INVALID_REQUEST', message: 'Profile 格式无效' });
    if (runtime.getActiveProfileId() === parsed.data.profileId) {
      return fail({ code: 'PROFILE_ACTIVE', message: '请先锁定或切换当前 Profile' });
    }
    deviceAuth?.cancelForProfile(parsed.data.profileId);
    await runtime.removeProfile(parsed.data.profileId);
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

  ipcMain.handle(ProfileAccessChannels.PIN_SET, async (_event, pin: unknown) => {
    const parsed = ProfilePinSchema.safeParse(pin);
    if (!parsed.success)
      return fail({ code: 'INVALID_REQUEST', message: '请输入 6 至 12 位数字 PIN' });
    await runtime.setCurrentProfilePin(parsed.data);
    return ok(null);
  });

  ipcMain.handle(ProfileAccessChannels.PIN_REMOVE, async () => {
    await runtime.removeCurrentProfilePin();
    return ok(null);
  });
}
