import { ipcMain } from 'electron';
import { z } from 'zod';
import { ok, fail, ResultErrorException } from '@memoflow/transport-contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import {
  ProfileAccessChannels,
  ProfileAutoEnterUpdateSchema,
  type DesktopAccessSnapshot,
  type ProfileAutoEnterCandidate,
  type ProfileAutoEnterSnapshot,
  type ProfileSummary,
  SelectProfileRequestSchema,
  RemoveProfileRequestSchema,
  CreateLocalAccountRequestSchema,
  RenameProfileRequestSchema,
  ProfilePasswordSchema,
} from '@memoflow/desktop-contracts';
import type { ProfileAutoEnterPreference } from './profile-auto-enter-preference';
import { isProfileAutoEnterSuppressed } from './profile-auto-enter-suppression';
import type { ProfileRegistry } from './profile-registry';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import { ProfileAvatarStore } from './profile-avatar-store';
import type { DesktopCloudConnectionManager } from './desktop-cloud-connection-manager';
import type { DeviceAuthCoordinator } from './device-auth-coordinator';

const logger = createLogger('ProfileAccessIpc');

/**
 * Resolves the display name of the Profile a failed selection targeted so the
 * log record can name it. A registry read failure is non-fatal: the caller still
 * logs the id, and the IPC result is unaffected either way.
 *
 * 查询打开失败时所选 Profile 的显示名，便于日志记录具体目标。注册表读取失败
 * 不影响主流程：调用方仍会记录 id，IPC 结果也不受影响。
 */
async function findTargetProfileName(
  registry: ProfileRegistry,
  profileId: string,
): Promise<string | undefined> {
  try {
    const profiles = await registry.list();
    return profiles.find((profile) => profile.profileId === profileId)?.displayName;
  } catch {
    return undefined;
  }
}

async function toSummary(
  profile: Awaited<ReturnType<ProfileRegistry['list']>>[number],
  runtime: DesktopProfileRuntimeManager,
): Promise<ProfileSummary> {
  return {
    profileId: profile.profileId,
    profileKind: profile.profileKind,
    displayName: profile.displayName,
    avatarSeed: profile.avatarSeed,
    avatarUrl: await new ProfileAvatarStore(runtime.getSharedResolver()).read(profile.profileId),
    identifierHint: profile.identifier,
    cloudAccountId: profile.cloudBinding?.cloudAccountId ?? null,
    lastActiveAt: profile.lastActiveAt,
    hasCredential: await runtime.hasCredential(profile.profileId),
    // Registered Profiles keep their own safeStorage key and never use the
    // remembered local-account copy, so the flag is local-account only.
    remembered:
      profile.profileKind === 'local' && (await runtime.hasRememberedKey(profile.profileId)),
  };
}

export function registerProfileAccessIpc(
  registry: ProfileRegistry,
  runtime: DesktopProfileRuntimeManager,
  cloudConnection: DesktopCloudConnectionManager,
  deviceAuth?: DeviceAuthCoordinator,
  autoEnterPreference?: ProfileAutoEnterPreference,
): void {
  /**
   * The quick-enter set: a registered Profile always has its own safeStorage
   * key, and a local account qualifies only while its remembered key copy
   * exists. This is the same source as the tile's `remembered` flag, so the
   * launch path can never offer an account the gate would ask a password for.
   */
  const autoEnterCandidates = async (): Promise<ProfileAutoEnterCandidate[]> => {
    const candidates: ProfileAutoEnterCandidate[] = [];
    for (const profile of await registry.list()) {
      const eligible =
        profile.profileKind === 'registered' || (await runtime.hasRememberedKey(profile.profileId));
      if (eligible)
        candidates.push({
          profileId: profile.profileId,
          displayName: profile.displayName,
          profileKind: profile.profileKind,
        });
    }
    return candidates;
  };
  const readAutoEnter = async (): Promise<ProfileAutoEnterSnapshot> => ({
    profileId: autoEnterPreference?.get() ?? null,
    candidates: await autoEnterCandidates(),
    suppressed: isProfileAutoEnterSuppressed(),
  });

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
    return runtime.runExclusive(async () => {
      const descriptor = runtime.getActiveProfileDescriptorSync();
      if (descriptor) await cloudConnection.restore(descriptor);
      return ok(await readSnapshot());
    });
  });

  ipcMain.handle(ProfileAccessChannels.LIST, async () =>
    ok(await Promise.all((await registry.list()).map((profile) => toSummary(profile, runtime)))),
  );

  // Issue #926: the identity window reads this on a cold start and the Settings
  // account section reads/writes it. A target without remembered material is
  // rejected here, so no password-free channel is ever created for it.
  ipcMain.handle(ProfileAccessChannels.AUTO_ENTER_GET, async () => ok(await readAutoEnter()));
  ipcMain.handle(ProfileAccessChannels.AUTO_ENTER_SET, async (_event, input: unknown) => {
    if (!autoEnterPreference)
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Automatic entry preference is unavailable',
      });
    const parsed = ProfileAutoEnterUpdateSchema.safeParse(input);
    if (!parsed.success) return fail({ code: 'INVALID_REQUEST', message: '自动进入设置格式无效' });
    if (parsed.data.profileId !== null) {
      const candidates = await autoEnterCandidates();
      if (!candidates.some((candidate) => candidate.profileId === parsed.data.profileId))
        return fail({ code: 'AUTO_ENTER_INELIGIBLE', message: '该账号没有可用的记住凭据' });
    }
    autoEnterPreference.set(parsed.data.profileId);
    return ok(await readAutoEnter());
  });

  ipcMain.handle(ProfileAccessChannels.CREATE_LOCAL_ACCOUNT, async (_event, input: unknown) => {
    const parsed = CreateLocalAccountRequestSchema.safeParse(input);
    if (!parsed.success)
      return fail({ code: 'INVALID_REQUEST', message: '请输入 1–80 字的昵称和至少 8 位密码' });
    const profile = await runtime.createLocalAccount(
      parsed.data.displayName.trim(),
      parsed.data.password,
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
      return fail({ code: 'INVALID_REQUEST', message: 'Profile 或密码格式无效' });
    const activeProfileId = runtime.getActiveProfileId();
    if (activeProfileId) deviceAuth?.cancelForProfile(activeProfileId);
    try {
      await runtime.openProfile(parsed.data.profileId, parsed.data.password, {
        remember: parsed.data.remember,
      });
      return ok(null);
    } catch (error) {
      // Direct open from the Profile Access window has no other main-process
      // record: the WindowManager auto-open path logs its own warn, this one
      // does not go through it.
      // Profile Access 窗口直接打开没有其它主进程记录：WindowManager 的自动
      // 打开路径会自己打 warn，但这条路径不经过它。
      // "Password required" is a normal routing result, not a failure to log as a
      // defect: the window switches to the in-place password state.
      const passwordRequired =
        error instanceof ResultErrorException && error.code === 'PROFILE_PASSWORD_REQUIRED';
      if (!passwordRequired) {
        logger.warn('Selected Profile could not be opened', {
          profileId: parsed.data.profileId,
          profileName: await findTargetProfileName(registry, parsed.data.profileId),
          error,
        });
      }
      return fail({
        code: passwordRequired ? 'PROFILE_PASSWORD_REQUIRED' : 'PROFILE_OPEN_FAILED',
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

  ipcMain.handle(ProfileAccessChannels.PASSWORD_SET, async (_event, password: unknown) => {
    const parsed = z
      .object({ currentPassword: ProfilePasswordSchema, newPassword: ProfilePasswordSchema })
      .strict()
      .safeParse(password);
    if (!parsed.success) return fail({ code: 'INVALID_REQUEST', message: '密码长度需为 8–100 位' });
    try {
      await runtime.setCurrentProfilePassword(parsed.data.newPassword, parsed.data.currentPassword);
      return ok(null);
    } catch (error) {
      return fail({
        code: error instanceof ResultErrorException ? error.code : 'PASSWORD_SET_FAILED',
        message: error instanceof Error ? error.message : '无法修改密码',
      });
    }
  });
}
