import { ipcMain } from 'electron';
import { ok, fail } from '@memoflow/transport-contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { ProfileAvatarChannels } from '@memoflow/desktop-contracts';
import type { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import { ProfileAvatarStore } from './profile-avatar-store';

const logger = createLogger('ProfileAvatarIpc');

/**
 * Avatar IPC is scoped to the active Profile: the file lives in that Profile's
 * data directory and switching Profiles changes the target without a renderer
 * supplied id. Issue #858.
 */
export function registerProfileAvatarIpc(runtime: DesktopProfileRuntimeManager): void {
  const store = new ProfileAvatarStore(runtime.getSharedResolver());

  ipcMain.handle(ProfileAvatarChannels.LOAD, async () => {
    const profileId = runtime.getActiveProfileId();
    if (!profileId) return ok(null);
    return ok(await store.read(profileId));
  });

  ipcMain.handle(ProfileAvatarChannels.SAVE, async (_event, input: unknown) => {
    const profileId = runtime.getActiveProfileId();
    if (!profileId) return fail({ code: 'NO_ACTIVE_PROFILE', message: '请先打开一个连接' });
    try {
      return ok(await store.write(profileId, input as string));
    } catch (error) {
      logger.warn('Could not save Profile avatar', { profileId, error });
      return fail({
        code: 'AVATAR_SAVE_FAILED',
        message: error instanceof Error ? error.message : '头像保存失败',
      });
    }
  });
}
