import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import type {
  KnowledgeNoteProjectionClientDTO,
  KnowledgeNoteProjectionIndexStatus,
} from '@memoflow/contracts/repository';

export type GithubWebhookDeliveryStatus =
  'Received' | 'Processing' | 'Processed' | 'Ignored' | 'Failed';

export interface GithubWebhookDeliveryRecord {
  id: string;
  connectionId: string;
  deliveryId: string;
  eventName: string;
  beforeSha: string | null;
  afterSha: string | null;
  forced: boolean;
  status: GithubWebhookDeliveryStatus;
  errorMessage: string | null;
  receivedAt: number;
  processedAt: number | null;
}

export interface IGithubWebhookDeliveryRepository {
  reserve(record: GithubWebhookDeliveryRecord): Promise<boolean>;
  findById(id: string): Promise<GithubWebhookDeliveryRecord | null>;
  listPending(limit: number): Promise<GithubWebhookDeliveryRecord[]>;
  updateStatus(
    id: string,
    connectionId: string,
    status: GithubWebhookDeliveryStatus,
    errorMessage?: string | null,
  ): Promise<void>;
}

export interface KnowledgeNoteProjectionUpsert {
  id: string;
  connectionId: string;
  knowledgeDocumentId: KnowledgeDocumentId | null;
  relativePath: string;
  commitSha: string;
  blobSha: string;
  contentHash: string;
  frontmatter: Record<string, unknown>;
  markdownContent: string;
  indexStatus: KnowledgeNoteProjectionIndexStatus;
}

export interface KnowledgeNoteProjectionDeletion {
  id: string;
  knowledgeDocumentId: KnowledgeDocumentId | null;
  relativePath: string;
}

export interface KnowledgeNoteLinkGraphSourceSet {
  notes: KnowledgeNoteProjectionClientDTO[];
  truncated: boolean;
}

export interface IKnowledgeNoteProjectionRepository {
  applySnapshot(
    connectionId: string,
    commitSha: string,
    notes: KnowledgeNoteProjectionUpsert[],
  ): Promise<KnowledgeNoteProjectionDeletion[]>;
  applyChanges(
    connectionId: string,
    commitSha: string,
    notes: KnowledgeNoteProjectionUpsert[],
    deletedPaths: string[],
  ): Promise<void>;
  listByIdentity(
    identityId: string,
    options: { connectionId?: string; query?: string; limit: number },
  ): Promise<KnowledgeNoteProjectionClientDTO[]>;
  findByIdForIdentity(
    identityId: string,
    projectionId: string,
  ): Promise<KnowledgeNoteProjectionClientDTO | null>;
  findByPath(
    connectionId: string,
    relativePath: string,
  ): Promise<KnowledgeNoteProjectionClientDTO | null>;
  findLiveByDocumentId(
    connectionId: string,
    knowledgeDocumentId: KnowledgeDocumentId,
  ): Promise<KnowledgeNoteProjectionClientDTO[]>;
  listLiveByConnection(connectionId: string): Promise<KnowledgeNoteProjectionClientDTO[]>;
  loadLinkGraphSourcesForIdentity(
    identityId: string,
    centerProjectionId: string,
    limit: number,
  ): Promise<KnowledgeNoteLinkGraphSourceSet | null>;
  updateIndexStatusForIdentity(
    identityId: string,
    projectionId: string,
    expectedContentHash: string,
    status: KnowledgeNoteProjectionIndexStatus,
  ): Promise<boolean>;
}

export type KnowledgeWriteRequestStatus = 'Pending' | 'Committed' | 'Failed';

/**
 * Projection operation status is tracked separately from the Git commit status
 * so a write request that is `Committed` but whose projection is `Pending` or
 * `Failed` stays visible and replayable (W6-A).
 */
export type KnowledgeWriteRequestProjectionStatus = 'Pending' | 'Succeeded' | 'Failed';

export interface KnowledgeWriteRequestProjectionSource {
  blobSha: string;
  markdownContent: string;
}

export interface KnowledgeWriteRequestRecord {
  id: string;
  identityId: string;
  connectionId: string;
  requestId: string;
  requestHash: string;
  knowledgeDocumentId: KnowledgeDocumentId;
  relativePath: string;
  status: KnowledgeWriteRequestStatus;
  commitSha: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  projectionStatus: KnowledgeWriteRequestProjectionStatus;
  projectionErrorCode: string | null;
  projectionErrorMessage: string | null;
  projectionAttempts: number;
  projectedAt: number | null;
  blobSha: string | null;
  markdownContent: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface IKnowledgeWriteRequestRepository {
  findByIdentityAndRequestId(
    identityId: string,
    requestId: string,
  ): Promise<KnowledgeWriteRequestRecord | null>;
  findByIdForIdentity(identityId: string, id: string): Promise<KnowledgeWriteRequestRecord | null>;
  create(record: KnowledgeWriteRequestRecord): Promise<boolean>;
  /** Status transitions must stay scoped to the owning identity (residual 109). */
  retryFailed(identityId: string, id: string, updatedAt: number): Promise<boolean>;
  markCommitted(identityId: string, id: string, commitSha: string): Promise<void>;
  markFailed(identityId: string, id: string, code: string, message: string): Promise<void>;
  /** Bind the projection source (blob + markdown) to the committed request and mark its projection pending. */
  bindProjectionSource(
    identityId: string,
    id: string,
    source: KnowledgeWriteRequestProjectionSource,
  ): Promise<boolean>;
  /**
   * Advance the projection status to Succeeded. Idempotent: never regresses an
   * already Succeeded projection. Returns false when the row is not owned or
   * the projection is already Succeeded (no-op).
   */
  markProjectionSucceeded(identityId: string, id: string, now: number): Promise<boolean>;
  /** Record a projection failure. Never regresses an already Succeeded projection. */
  markProjectionFailed(
    identityId: string,
    id: string,
    code: string,
    message: string,
    now: number,
  ): Promise<boolean>;
  /**
   * Bind every write request committed at `commitSha` for the connection to a
   * Succeeded projection (webhook/reconcile refresh). Only touches rows whose
   * projection is not already Succeeded. Returns the number of rows updated.
   */
  markProjectionSucceededByCommit(
    connectionId: string,
    commitSha: string,
    now: number,
  ): Promise<number>;
  listProjectionPendingOrFailedForConnection(
    connectionId: string,
    limit: number,
  ): Promise<KnowledgeWriteRequestRecord[]>;
  listForIdentity(
    identityId: string,
    options: { connectionId?: string; limit: number },
  ): Promise<KnowledgeWriteRequestRecord[]>;
}
