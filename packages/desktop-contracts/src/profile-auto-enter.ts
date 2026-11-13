import { z } from 'zod';

/**
 * Steam-style "enter this account at launch" preference (#926).
 *
 * Only accounts that already own remembered material qualify: a registered
 * Profile (its safeStorage key is intrinsic) or a local account whose data key
 * is still held by the main process. This contract never carries a password or
 * a token, and stores nothing beyond the chosen Profile id.
 */
export const ProfileAutoEnterCandidateSchema = z.object({
  profileId: z.string(),
  displayName: z.string(),
  profileKind: z.enum(['local', 'registered']),
});
export const ProfileAutoEnterSnapshotSchema = z.object({
  /** The chosen Profile id, or null when automatic entry is off. */
  profileId: z.string().nullable(),
  /** Accounts a cold start could enter without a password right now. */
  candidates: z.array(ProfileAutoEnterCandidateSchema),
  /**
   * True once this launch has signed out. Main-process memory only, so a
   * restart clears it; a sign-out never sends the user straight back in.
   */
  suppressed: z.boolean(),
});
export const ProfileAutoEnterUpdateSchema = z
  .object({ profileId: z.string().min(1).max(128).nullable() })
  .strict();
export type ProfileAutoEnterCandidate = z.infer<typeof ProfileAutoEnterCandidateSchema>;
export type ProfileAutoEnterSnapshot = z.infer<typeof ProfileAutoEnterSnapshotSchema>;
export type ProfileAutoEnterUpdate = z.infer<typeof ProfileAutoEnterUpdateSchema>;
