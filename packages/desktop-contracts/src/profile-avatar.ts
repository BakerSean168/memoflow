import { z } from 'zod';

/**
 * Per-Profile avatar file transport (Issue #858).
 *
 * The renderer owns the image processing (long edge ≤ 1024, format normalized to
 * PNG) and sends the resulting data URL here; the main process writes it to the
 * active Profile's fixed data-directory slot. Reading returns a data URL so the
 * same rendering path works for every surface without a custom protocol.
 */
export const ProfileAvatarChannels = {
  LOAD: 'profile-avatar:load',
  SAVE: 'profile-avatar:save',
} as const;

/** Upper bound for the normalized PNG; a 1024px avatar stays far below this. */
export const PROFILE_AVATAR_MAX_BYTES = 8 * 1024 * 1024;
export const PROFILE_AVATAR_DATA_URL_PREFIX = 'data:image/png;base64,';

export const SaveProfileAvatarRequestSchema = z
  .string()
  .startsWith(PROFILE_AVATAR_DATA_URL_PREFIX, 'Avatar must be a PNG data URL')
  .max(
    PROFILE_AVATAR_DATA_URL_PREFIX.length + Math.ceil((PROFILE_AVATAR_MAX_BYTES * 4) / 3) + 4,
    'Avatar payload is too large',
  );

export type SaveProfileAvatarRequest = z.infer<typeof SaveProfileAvatarRequestSchema>;
