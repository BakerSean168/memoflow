import fs from 'node:fs';
import path from 'node:path';
import {
  PROFILE_AVATAR_DATA_URL_PREFIX,
  PROFILE_AVATAR_MAX_BYTES,
  SaveProfileAvatarRequestSchema,
} from '@memoflow/desktop-contracts';
import { createLogger } from '@memoflow/utils/logger';
import {
  createProfilePathResolver,
  type ProfilePathResolver,
  type SharedPathResolver,
} from '../paths';

const logger = createLogger('ProfileAvatarStore');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function toDataUrl(png: Buffer): string {
  return `${PROFILE_AVATAR_DATA_URL_PREFIX}${png.toString('base64')}`;
}

function decodePng(dataUrl: string): Buffer {
  const parsed = SaveProfileAvatarRequestSchema.safeParse(dataUrl);
  if (!parsed.success) throw new Error('头像图片格式无效');
  const bytes = Buffer.from(parsed.data.slice(PROFILE_AVATAR_DATA_URL_PREFIX.length), 'base64');
  if (bytes.byteLength === 0 || bytes.byteLength > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error('头像图片大小超出限制');
  }
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('头像图片格式无效');
  }
  return bytes;
}

/**
 * Reads and writes the per-Profile avatar at the fixed slot inside that
 * Profile's existing storage directory (`<profile>/storage/avatar.png`).
 *
 * Reading is shared by the renderer IPC and the Profile summary projection so
 * the quick-login tiles and the account surfaces always resolve the same file.
 */
export class ProfileAvatarStore {
  constructor(private readonly sharedResolver: SharedPathResolver) {}

  private resolver(profileId: string): ProfilePathResolver {
    return createProfilePathResolver(this.sharedResolver.roots, profileId);
  }

  async read(profileId: string): Promise<string | null> {
    try {
      const png = await fs.promises.readFile(this.resolver(profileId).avatarPath);
      return toDataUrl(png);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') return null;
      logger.warn('Could not read Profile avatar', { profileId, error });
      return null;
    }
  }

  async write(profileId: string, dataUrl: string): Promise<string> {
    const png = decodePng(dataUrl);
    const { avatarPath } = this.resolver(profileId);
    await fs.promises.mkdir(path.dirname(avatarPath), { recursive: true });
    const temporaryPath = `${avatarPath}.tmp`;
    await fs.promises.writeFile(temporaryPath, png, { mode: 0o600 });
    await fs.promises.rename(temporaryPath, avatarPath);
    return toDataUrl(png);
  }
}
