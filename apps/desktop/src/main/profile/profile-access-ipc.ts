import { ipcMain } from 'electron';
import { ok, fail, ResultErrorException } from '@memoflow/transport-contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import {
  ProfileAccessChannels,
  type DesktopAccessSnapshot,
  type ProfileSummary,
  SelectProfileRequestSchema,
  RemoveProfileRequestSchema,
  CreateLocalAccountRequestSchema,
  RenameProfileRequestSchema,
  ProfilePasswordSchema,
} from '@memoflow/desktop-contracts';
import type { ProfileRegistry } from './profile-registry';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
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
    identifierHint: profile.identifier,
    cloudAccountId: profile.cloudBinding?.cloudAccountId ?? null,
    lastActiveAt: profile.lastActiveAt,
    hasCredential: await runtime.hasCredential(profile.profileId),
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
    return runtime.runExclusive(async () => {
      const descriptor = runtime.getActiveProfileDescriptorSync();
      if (descriptor) await cloudConnection.restore(descriptor);
      return ok(await readSnapshot());
    });
  });

  ipcMain.handle(ProfileAccessChannels.LIST, async () =>
    ok(await Promise.all((await registry.list()).map((profile) => toSummary(profile, runtime)))),
  );

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
    const parsed = ProfilePasswordSchema.safeParse(password);
    if (!parsed.success) return fail({ code: 'INVALID_REQUEST', message: '密码长度需为 8–100 位' });
    try {
      await runtime.setCurrentProfilePassword(parsed.data);
      return ok(null);
    } catch (error) {
      return fail({
        code: error instanceof ResultErrorException ? error.code : 'PASSWORD_SET_FAILED',
        message: error instanceof Error ? error.message : '无法修改密码',
      });
    }
  });
}
