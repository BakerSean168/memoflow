import { z } from 'zod';
import { ProfilePinSchema } from './profile-access';
import {
  ProfileImportBlockerSchema,
  ProfileImportPlanSchema,
  ProfileImportRequestSchema,
} from '../modules/data-portability/profile-import';

const LocalProfileId = z.string().regex(/^p_[a-f0-9]{24}$/);
export const DesktopProfileImportTargetSchema = z
  .object({ targetProfileId: LocalProfileId })
  .strict();
export const DesktopProfileImportPrepareSchema = DesktopProfileImportTargetSchema.extend({
  requestId: ProfileImportRequestSchema.shape.requestId,
  sourceProfileId: LocalProfileId,
  pin: ProfilePinSchema.optional(),
});
export const DesktopProfileImportOperationRequestSchema = DesktopProfileImportTargetSchema.extend({
  requestId: ProfileImportRequestSchema.shape.requestId,
  pin: ProfilePinSchema.optional(),
});
export const DesktopProfileImportCommitSchema = DesktopProfileImportOperationRequestSchema.extend({
  deleteSource: z.boolean(),
});
export const DesktopProfileImportViewSchema = z
  .object({
    requestId: ProfileImportRequestSchema.shape.requestId,
    targetProfileId: LocalProfileId,
    sourceProfileId: LocalProfileId,
    phase: z.enum([
      'prepared',
      'preflight',
      'committing',
      'committed',
      'verified',
      'cleanup_pending',
      'completed',
    ]),
    plan: ProfileImportPlanSchema.nullable(),
    blockers: z.array(ProfileImportBlockerSchema),
    deleteSource: z.boolean(),
    serverVerified: z.boolean(),
    localVerified: z.boolean(),
    sourceUnchanged: z.boolean().nullable(),
  })
  .strict();
export const DesktopProfileImportChannels = {
  LIST: 'profile-import:list',
  PREPARE: 'profile-import:prepare',
  COMMIT: 'profile-import:commit',
  RECOVER: 'profile-import:recover',
  CONSUME_PROMPT: 'profile-import:consume-prompt',
} as const;
export type DesktopProfileImportView = z.infer<typeof DesktopProfileImportViewSchema>;
export type DesktopProfileImportPrepare = z.infer<typeof DesktopProfileImportPrepareSchema>;
export type DesktopProfileImportCommit = z.infer<typeof DesktopProfileImportCommitSchema>;
export type DesktopProfileImportOperationRequest = z.infer<
  typeof DesktopProfileImportOperationRequestSchema
>;
