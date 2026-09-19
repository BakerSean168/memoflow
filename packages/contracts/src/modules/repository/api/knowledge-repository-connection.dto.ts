/**
 * Knowledge repository connection API contracts (GitHub App install — not login OAuth).
 * 知识仓库连接 API 契约（GitHub App 安装授权，不是登录 OAuth）。
 */

import { z } from 'zod';
import type { KnowledgeSpaceId } from '../../../primitives';
import { brandedId, ID_PREFIXES } from '../../../primitives';
import {
  KnowledgeProjectionCheckpointSchema,
  KnowledgeRemoteBindingSchema,
  RemoteHistoryFenceSchema,
  RemoteRepositoryObservationSchema,
} from '../aggregates/knowledge-remote-binding';

export const KnowledgeRepositoryInstallationClientKindSchema = z.enum(['web', 'desktop']);
export type KnowledgeRepositoryInstallationClientKind = z.infer<
  typeof KnowledgeRepositoryInstallationClientKindSchema
>;

export const KnowledgeRepositoryInstallationIntentStatusSchema = z.enum([
  'Pending',
  'CallbackReceived',
  'Finalized',
  'Consumed',
  'Expired',
]);
export type KnowledgeRepositoryInstallationIntentStatus = z.infer<
  typeof KnowledgeRepositoryInstallationIntentStatusSchema
>;

export const StartKnowledgeRepositoryInstallationSchema = z.object({
  returnUrl: z.string().url().optional(),
  clientKind: KnowledgeRepositoryInstallationClientKindSchema.optional(),
});

export type StartKnowledgeRepositoryInstallationReq = z.infer<
  typeof StartKnowledgeRepositoryInstallationSchema
>;

export const GitHubInstallationRepositorySchema = z.object({
  id: z.string().min(1),
  nodeId: z.string(),
  fullName: z.string().min(1),
  ownerId: z.string().min(1),
  private: z.boolean(),
  archived: z.boolean(),
  disabled: z.boolean(),
  defaultBranch: z.string().min(1),
  permissions: z.object({
    admin: z.boolean(),
    push: z.boolean(),
    pull: z.boolean(),
  }),
});

// Residual 701: installation repository dual body retired — OpenAPI + transport use Schema only.
export type GitHubInstallationRepositoryDTO = z.infer<typeof GitHubInstallationRepositorySchema>;

export const StartKnowledgeRepositoryInstallationResponseSchema = z.object({
  intentId: z.string().min(1),
  installationUrl: z.string().url(),
  expiresAt: z.number(),
  /** False when the server safely resumed a previously verified installation. */
  requiresExternalBrowser: z.boolean().default(true),
});

// Residual 699: response dual body retired — OpenAPI + transport use ResponseSchema only.
export type StartKnowledgeRepositoryInstallationRes = z.infer<
  typeof StartKnowledgeRepositoryInstallationResponseSchema
>;

export const CompleteKnowledgeRepositoryInstallationSchema = z.object({
  state: z.string().min(16),
  installationId: z.string().min(1),
  setupAction: z.enum(['install', 'update']).optional(),
});

export type CompleteKnowledgeRepositoryInstallationReq = z.infer<
  typeof CompleteKnowledgeRepositoryInstallationSchema
>;

export const CompleteKnowledgeRepositoryInstallationResponseSchema = z.object({
  installationId: z.string().min(1),
  githubAccountId: z.string().min(1),
  repositories: z.array(GitHubInstallationRepositorySchema),
  returnUrl: z.string().nullable(),
});

export const KnowledgeRepositoryInstallationIntentStatusResponseSchema = z.object({
  intentId: z.string().min(1),
  status: KnowledgeRepositoryInstallationIntentStatusSchema,
  clientKind: KnowledgeRepositoryInstallationClientKindSchema,
  expiresAt: z.number(),
  installationId: z.string().min(1).nullable(),
});
export type KnowledgeRepositoryInstallationIntentStatusResponse = z.infer<
  typeof KnowledgeRepositoryInstallationIntentStatusResponseSchema
>;

// Residual 699: response dual body retired — OpenAPI + transport use ResponseSchema only.
export type CompleteKnowledgeRepositoryInstallationRes = z.infer<
  typeof CompleteKnowledgeRepositoryInstallationResponseSchema
>;

export const CreateKnowledgeRepositoryConnectionSchema = z
  .object({
    installationId: z.string().min(1),
    /** Numeric repository id selected from the server-verified installation inventory. */
    githubRepositoryId: z.string().min(1),
    /**
     * Desktop installation intents MUST provide the current Local Vault space id.
     * Web intents omit it and the server creates/reuses the account's cloud space.
     */
    knowledgeSpaceId: brandedId<KnowledgeSpaceId>(ID_PREFIXES.KnowledgeSpaceId).optional(),
  })
  .strict();

export type CreateKnowledgeRepositoryConnectionReq = z.infer<
  typeof CreateKnowledgeRepositoryConnectionSchema
>;

/**
 * Read model composed from four independently owned ADR-089 axes.
 * No provider check is performed merely to list this value.
 */
export const KnowledgeRemoteBindingClientSchema = KnowledgeRemoteBindingSchema.extend({
  observation: RemoteRepositoryObservationSchema.nullable(),
  historyFence: RemoteHistoryFenceSchema.nullable(),
  projectionCheckpoint: KnowledgeProjectionCheckpointSchema.nullable(),
}).strict();

export type KnowledgeRemoteBindingClientDTO = z.infer<typeof KnowledgeRemoteBindingClientSchema>;

export const ListKnowledgeRepositoryConnectionsResSchema = z.object({
  connections: z.array(KnowledgeRemoteBindingClientSchema),
});

// Residual 773: list connections Res dual retired — OpenAPI + transport use ResSchema
// (semantic Res is a z.infer alias; nested connection shape is ClientSchema).
export type ListKnowledgeRepositoryConnectionsRes = z.infer<
  typeof ListKnowledgeRepositoryConnectionsResSchema
>;

export const KnowledgeRepositoryConnectionParamsSchema = z.object({
  connectionId: z.string().min(1),
});

export const DisconnectKnowledgeRepositoryConnectionSchema =
  KnowledgeRepositoryConnectionParamsSchema.extend({
    purgeCloudData: z.boolean().default(false),
  });

export type DisconnectKnowledgeRepositoryConnectionReq = z.infer<
  typeof DisconnectKnowledgeRepositoryConnectionSchema
>;
/** Void disconnect success body; transport serializes as `data: null`. */
export const DisconnectKnowledgeRepositoryConnectionResponseSchema = z.null();
export type DisconnectKnowledgeRepositoryConnectionRes = null;

/**
 * Short-lived Git credential returned only to the Desktop runtime.
 * The token is repository-scoped by the GitHub App API and never persisted in client DTOs.
 */
export const KnowledgeRepositoryInstallationTokenSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.number(),
  repositoryId: z.string().min(1),
});

export type KnowledgeRepositoryInstallationTokenRes = z.infer<
  typeof KnowledgeRepositoryInstallationTokenSchema
>;

export const KnowledgeRepositoryContentStateSchema = z.enum(['Empty', 'NonEmpty']);
export type KnowledgeRepositoryContentState = z.infer<typeof KnowledgeRepositoryContentStateSchema>;

export const KnowledgeRepositoryFirstReconciliationActionSchema = z.enum([
  'InitializeRemoteFromLocal',
  'CloneRemoteIntoLocal',
  'InitializeBoth',
  'ManualResolutionRequired',
]);
export type KnowledgeRepositoryFirstReconciliationAction = z.infer<
  typeof KnowledgeRepositoryFirstReconciliationActionSchema
>;

/**
 * Desktop reports only the local content shape. The server independently
 * revalidates the identity-owned connection and reads the GitHub default branch.
 */
export const PreviewKnowledgeRepositoryReconciliationSchema = z.object({
  localState: KnowledgeRepositoryContentStateSchema,
});
export type PreviewKnowledgeRepositoryReconciliationReq = z.infer<
  typeof PreviewKnowledgeRepositoryReconciliationSchema
>;

export const KnowledgeRepositoryReconciliationPreviewSchema = z.object({
  connectionId: z.string().min(1),
  localState: KnowledgeRepositoryContentStateSchema,
  remoteState: KnowledgeRepositoryContentStateSchema,
  action: KnowledgeRepositoryFirstReconciliationActionSchema,
  defaultBranch: z.string().min(1),
  remoteHeadSha: z.string().nullable(),
});
export type KnowledgeRepositoryReconciliationPreview = z.infer<
  typeof KnowledgeRepositoryReconciliationPreviewSchema
>;

export const KnowledgeRepositoryExecutableReconciliationActionSchema = z.enum([
  'InitializeRemoteFromLocal',
  'CloneRemoteIntoLocal',
  'InitializeBoth',
]);
export type KnowledgeRepositoryExecutableReconciliationAction = z.infer<
  typeof KnowledgeRepositoryExecutableReconciliationActionSchema
>;

export const GitCommitShaSchema = z.string().regex(/^[a-f0-9]{40,64}$/i);

/**
 * Immutable confirmation of the read-only preview that the user approved.
 * Desktop must recompute the preview immediately before executing Git commands.
 */
export const ExecuteKnowledgeRepositoryReconciliationSchema = z.object({
  connectionId: z.string().min(1),
  expectedAction: KnowledgeRepositoryExecutableReconciliationActionSchema,
  expectedDefaultBranch: z.string().min(1),
  expectedRemoteHeadSha: GitCommitShaSchema.nullable(),
});
export type ExecuteKnowledgeRepositoryReconciliationReq = z.infer<
  typeof ExecuteKnowledgeRepositoryReconciliationSchema
>;

/**
 * Desktop reports the commit currently checked out after any Git mutation.
 * The server independently reads the live default-branch HEAD before advancing
 * the shared cursor, so this contract is valid for both first reconciliation
 * and later continuous synchronization.
 */
export const ConfirmKnowledgeRepositoryHeadSchema = z.object({
  headSha: GitCommitShaSchema,
});
export type ConfirmKnowledgeRepositoryHeadReq = z.infer<
  typeof ConfirmKnowledgeRepositoryHeadSchema
>;

export const ExecuteKnowledgeRepositoryReconciliationResponseSchema = z.object({
  connection: KnowledgeRemoteBindingClientSchema,
  action: KnowledgeRepositoryExecutableReconciliationActionSchema,
  headSha: GitCommitShaSchema,
  reusedExistingSynchronization: z.boolean(),
});
export type ExecuteKnowledgeRepositoryReconciliationRes = z.infer<
  typeof ExecuteKnowledgeRepositoryReconciliationResponseSchema
>;

// Residual 669: sync request reuses connection params schema (no dual body).
export type SyncKnowledgeRepositoryReq = z.infer<typeof KnowledgeRepositoryConnectionParamsSchema>;

export const KnowledgeRepositorySyncOutcomeSchema = z.enum([
  'UpToDate',
  'Pushed',
  'Pulled',
  'RebasedAndPushed',
]);
export type KnowledgeRepositorySyncOutcome = z.infer<typeof KnowledgeRepositorySyncOutcomeSchema>;

export const KnowledgeRepositorySyncConflictContextSchema = z.object({
  localHeadSha: GitCommitShaSchema.nullable(),
  remoteHeadSha: GitCommitShaSchema.nullable(),
  conflictingPaths: z.array(z.string()),
  rebaseInProgress: z.boolean(),
});
export type KnowledgeRepositorySyncConflictContext = z.infer<
  typeof KnowledgeRepositorySyncConflictContextSchema
>;

export const KnowledgeRepositorySyncPendingContextSchema = z.object({
  localHeadSha: GitCommitShaSchema,
  localCommitCreated: z.boolean(),
  uploadPending: z.literal(true),
});
export type KnowledgeRepositorySyncPendingContext = z.infer<
  typeof KnowledgeRepositorySyncPendingContextSchema
>;

export const SyncKnowledgeRepositoryResponseSchema = z.object({
  connection: KnowledgeRemoteBindingClientSchema,
  outcome: KnowledgeRepositorySyncOutcomeSchema,
  headSha: GitCommitShaSchema,
  localCommitCreated: z.boolean(),
  remoteChangesApplied: z.boolean(),
  pushed: z.boolean(),
});
export type SyncKnowledgeRepositoryRes = z.infer<typeof SyncKnowledgeRepositoryResponseSchema>;
