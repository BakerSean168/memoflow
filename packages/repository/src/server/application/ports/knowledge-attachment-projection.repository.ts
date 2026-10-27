import type { KnowledgeAttachmentProjectionClientDTO } from '@memoflow/repository-contracts';

export interface KnowledgeAttachmentProjectionUpsert {
  id: string;
  connectionId: string;
  relativePath: string;
  commitSha: string;
  blobSha: string;
  byteSize: number | null;
  mediaType: string;
}

export interface IKnowledgeAttachmentProjectionRepository {
  applySnapshot(
    connectionId: string,
    commitSha: string,
    attachments: KnowledgeAttachmentProjectionUpsert[],
  ): Promise<void>;
  applyChanges(
    connectionId: string,
    commitSha: string,
    attachments: KnowledgeAttachmentProjectionUpsert[],
    deletedPaths: string[],
  ): Promise<void>;
  listByIdentity(
    identityId: string,
    options: { connectionId?: string; query?: string; limit: number },
  ): Promise<KnowledgeAttachmentProjectionClientDTO[]>;
  findByIdForIdentity(
    identityId: string,
    projectionId: string,
  ): Promise<KnowledgeAttachmentProjectionClientDTO | null>;
}
