import { z } from 'zod';
export type ProfileKind = 'guest' | 'registered';
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
  hasPin: boolean;
}

export const ProfileIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const ProfileDisplayNameSchema = z.string().trim().min(1).max(80);
export const ProfilePinSchema = z.string().regex(/^\d{6,12}$/);
export const SelectProfileRequestSchema = z
  .object({ profileId: ProfileIdSchema, pin: ProfilePinSchema.optional() })
  .strict();
export const RemoveProfileRequestSchema = z.object({ profileId: ProfileIdSchema }).strict();
export const CreateGuestProfileRequestSchema = z
  .object({ requestId: z.string().uuid(), displayName: ProfileDisplayNameSchema.optional() })
  .strict();
export const RenameProfileRequestSchema = z
  .object({ profileId: ProfileIdSchema, displayName: ProfileDisplayNameSchema })
  .strict();
export type SelectProfileRequest = z.infer<typeof SelectProfileRequestSchema>;
export type RemoveProfileRequest = z.infer<typeof RemoveProfileRequestSchema>;
export type CreateGuestProfileRequest = z.infer<typeof CreateGuestProfileRequestSchema>;
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
