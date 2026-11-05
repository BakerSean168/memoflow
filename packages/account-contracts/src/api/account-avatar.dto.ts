/**
 * Cloud avatar transport contracts (Issue #859).
 *
 * The renderer already normalizes every avatar to a PNG data URL before local
 * persistence (#858); the cloud upload reuses that exact shape so the server
 * stores one canonical representation. The server answers with the
 * last-write-wins timestamp that other devices compare against.
 */
import { z } from 'zod';

export const ACCOUNT_AVATAR_DATA_URL_PREFIX = 'data:image/png;base64,';

/** Upper bound mirrors the desktop Profile avatar limit (#858). */
export const ACCOUNT_AVATAR_MAX_BYTES = 8 * 1024 * 1024;

export const UploadAccountAvatarSchema = z
  .string()
  .startsWith(ACCOUNT_AVATAR_DATA_URL_PREFIX, 'Avatar must be a PNG data URL')
  .max(
    ACCOUNT_AVATAR_DATA_URL_PREFIX.length + Math.ceil((ACCOUNT_AVATAR_MAX_BYTES * 4) / 3) + 4,
    'Avatar payload is too large',
  );

export type UploadAccountAvatarDataUrl = z.infer<typeof UploadAccountAvatarSchema>;

export const UploadAccountAvatarRequestSchema = z.object({
  dataUrl: UploadAccountAvatarSchema,
});
export type UploadAccountAvatarReq = z.infer<typeof UploadAccountAvatarRequestSchema>;

export const AccountAvatarUploadResultSchema = z.object({
  /** Server-side last-write-wins timestamp (epoch ms). */
  updatedAt: z.number(),
});
export type AccountAvatarUploadResult = z.infer<typeof AccountAvatarUploadResultSchema>;

export const AccountAvatarMetaSchema = z.object({
  /** Epoch ms of the stored avatar, or null when the account has none. */
  updatedAt: z.number().nullable(),
});
export type AccountAvatarMeta = z.infer<typeof AccountAvatarMetaSchema>;

export const AccountAvatarContentSchema = z.object({
  dataUrl: UploadAccountAvatarSchema,
  updatedAt: z.number(),
});
export type AccountAvatarContent = z.infer<typeof AccountAvatarContentSchema>;
