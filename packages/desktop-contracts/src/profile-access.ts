import { z } from 'zod';
export type ProfileKind = 'local' | 'registered';
export type ProfileUnlockState = 'LOCKED' | 'UNLOCKED';
export type ProfileCloudState = 'UNBOUND' | 'CHECKING' | 'ONLINE' | 'OFFLINE' | 'REAUTH_REQUIRED';

export interface ProfileSummary {
  profileId: string;
  profileKind: ProfileKind;
  displayName: string;
  avatarSeed: string;
  identifierHint: string | null;
  cloudAccountId: string | null;
  lastActiveAt: number;
  /** True when this account's data key is wrapped by a local password. */
  hasCredential: boolean;
}

export const ProfileIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const ProfileDisplayNameSchema = z.string().trim().min(1).max(80);
/** Local-account password: length is the only rule; no composition requirement. */
export const ProfilePasswordSchema = z.string().min(8).max(100);
export const SelectProfileRequestSchema = z
  .object({
    profileId: ProfileIdSchema,
    password: ProfilePasswordSchema.optional(),
    /** Stores a safeStorage copy of the unlocked data key (never the password). */
    remember: z.boolean().optional(),
  })
  .strict();
export const RemoveProfileRequestSchema = z.object({ profileId: ProfileIdSchema }).strict();
export const CreateLocalAccountRequestSchema = z
  .object({ displayName: ProfileDisplayNameSchema, password: ProfilePasswordSchema })
  .strict();
export const RenameProfileRequestSchema = z
  .object({ profileId: ProfileIdSchema, displayName: ProfileDisplayNameSchema })
  .strict();
export type SelectProfileRequest = z.infer<typeof SelectProfileRequestSchema>;
export type RemoveProfileRequest = z.infer<typeof RemoveProfileRequestSchema>;
export type CreateLocalAccountRequest = z.infer<typeof CreateLocalAccountRequestSchema>;
export type RenameProfileRequest = z.infer<typeof RenameProfileRequestSchema>;

export interface DesktopAccessSnapshot {
  profile: ProfileSummary | null;
  unlockState: ProfileUnlockState;
  cloudState: ProfileCloudState;
  capabilities: {
    local: boolean;
    sync: boolean;
    cloudAi: boolean;
    repositoryConnection: boolean;
  };
}
