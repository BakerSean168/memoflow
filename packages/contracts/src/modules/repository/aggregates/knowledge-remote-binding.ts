/**
 * ADR-089 canonical remote knowledge-source contracts.
 *
 * Durable binding choice, provider observation, Git history safety fence and
 * projection checkpoint are independent state axes. No single lifecycle
 * `status` is allowed to own all four concerns.
 */

import { z } from 'zod';
import { brandedId, ID_PREFIXES } from '../../../primitives';
import type { IdentityId, KnowledgeRemoteBindingId, KnowledgeSpaceId } from '../../../primitives';

export const KnowledgeRemoteProviderSchema = z.literal('GitHub');
export type KnowledgeRemoteProvider = z.infer<typeof KnowledgeRemoteProviderSchema>;

export const KnowledgeRemoteBindingSchema = z
  .object({
    id: brandedId<KnowledgeRemoteBindingId>(ID_PREFIXES.KnowledgeRemoteBindingId),
    knowledgeSpaceId: brandedId<KnowledgeSpaceId>(ID_PREFIXES.KnowledgeSpaceId),
    identityId: brandedId<IdentityId>(),
    provider: KnowledgeRemoteProviderSchema,
    installationId: z.string().min(1),
    repositoryId: z.string().min(1),
    repositoryFullNameSnapshot: z.string().min(1),
    connectedAt: z.number(),
    disconnectedAt: z.number().nullable(),
  })
  .strict();
export type KnowledgeRemoteBinding = z.infer<typeof KnowledgeRemoteBindingSchema>;

/** Server persistence metadata is technical concurrency state, not product lifecycle. */
export interface KnowledgeRemoteBindingServerDTO extends KnowledgeRemoteBinding {
  readonly version: number;
}

export const RemoteRepositoryContentsPermissionSchema = z.enum(['read', 'write', 'none']);
export type RemoteRepositoryContentsPermission = z.infer<
  typeof RemoteRepositoryContentsPermissionSchema
>;

export const RemoteRepositoryBlockReasonSchema = z.enum([
  'InstallationMissing',
  'InstallationSuspended',
  'ContentsPermissionRequired',
  'RepositoryAccessLost',
  'RepositoryPublic',
  'RepositoryArchived',
  'RepositoryDisabled',
  'DefaultBranchChanged',
  'CheckUnavailable',
]);
export type RemoteRepositoryBlockReason = z.infer<typeof RemoteRepositoryBlockReasonSchema>;

export const RemoteRepositoryEligibilitySchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('Ready') }).strict(),
  z
    .object({
      state: z.literal('Blocked'),
      reason: RemoteRepositoryBlockReasonSchema,
    })
    .strict(),
]);
export type RemoteRepositoryEligibility = z.infer<typeof RemoteRepositoryEligibilitySchema>;

export const RemoteRepositoryObservationSchema = z
  .object({
    bindingId: brandedId<KnowledgeRemoteBindingId>(ID_PREFIXES.KnowledgeRemoteBindingId),
    observedAt: z.number(),
    accountId: z.string().min(1),
    repositoryFullName: z.string().min(1),
    defaultBranch: z.string().min(1),
    private: z.boolean(),
    archived: z.boolean(),
    disabled: z.boolean(),
    contentsPermission: RemoteRepositoryContentsPermissionSchema,
    installationSuspended: z.boolean(),
    eligibility: RemoteRepositoryEligibilitySchema,
  })
  .strict();
export type RemoteRepositoryObservation = z.infer<typeof RemoteRepositoryObservationSchema>;

export const RemoteHistoryFenceSchema = z
  .object({
    bindingId: brandedId<KnowledgeRemoteBindingId>(ID_PREFIXES.KnowledgeRemoteBindingId),
    defaultBranch: z.string().min(1),
    lastConfirmedRemoteHeadSha: z.string().min(1),
    confirmedAt: z.number(),
  })
  .strict();
export type RemoteHistoryFence = z.infer<typeof RemoteHistoryFenceSchema>;

export const KnowledgeProjectionCheckpointStateSchema = z.enum([
  'Ready',
  'Lagging',
  'Rebuilding',
  'Failed',
]);
export type KnowledgeProjectionCheckpointState = z.infer<
  typeof KnowledgeProjectionCheckpointStateSchema
>;

export const KnowledgeProjectionCheckpointFailureSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

export const KnowledgeProjectionCheckpointSchema = z
  .object({
    bindingId: brandedId<KnowledgeRemoteBindingId>(ID_PREFIXES.KnowledgeRemoteBindingId),
    branch: z.string().min(1),
    projectedCommitSha: z.string().nullable(),
    state: KnowledgeProjectionCheckpointStateSchema,
    failure: KnowledgeProjectionCheckpointFailureSchema.nullable(),
    lastAttemptAt: z.number().nullable(),
    projectedAt: z.number().nullable(),
  })
  .strict();
export type KnowledgeProjectionCheckpoint = z.infer<typeof KnowledgeProjectionCheckpointSchema>;
