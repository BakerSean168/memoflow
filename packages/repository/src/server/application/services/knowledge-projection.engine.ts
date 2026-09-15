import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import {
  RepositoryNoteMutationType,
  type KnowledgeRemoteBindingServerDTO,
} from '@memoflow/contracts/repository';
import type {
  IdentityId,
  KnowledgeDocumentId,
  RepositoryId,
  ResourceId,
} from '@memoflow/contracts/primitives';
import type { IKnowledgeDocumentIdentityRepository } from '../ports/knowledge-document-identity.repository';
import type {
  IKnowledgeNoteProjectionRepository,
  KnowledgeNoteProjectionUpsert,
} from '../ports/knowledge-note-projection.repository';
import type {
  IKnowledgeAttachmentProjectionRepository,
  KnowledgeAttachmentProjectionUpsert,
} from '../ports/knowledge-attachment-projection.repository';
import {
  publishRepositoryNoteMutation,
  type RepositoryNoteMutationPayload,
} from './repository-note-mutation.publisher';
import {
  KnowledgeDocumentIdentityConflictError,
  readKnowledgeDocumentId,
} from './knowledge-document-identity.policy';

export interface KnowledgeProjectionNoteSource {
  projectionId?: string;
  relativePath: string;
  blobSha: string;
  markdownContent: string;
  mutation?: RepositoryNoteMutationPayload['mutation'];
  previousPath?: string | null;
}

export interface KnowledgeProjectionAttachmentSource {
  relativePath: string;
  blobSha: string;
  byteSize: number | null;
  mediaType: string;
  previousPath?: string | null;
}

export interface KnowledgeProjectionChangeSet {
  notes: KnowledgeProjectionNoteSource[];
  deletedPaths?: string[];
  attachments?: KnowledgeProjectionAttachmentSource[];
  deletedAttachmentPaths?: string[];
}

export interface KnowledgeProjectionSnapshot {
  files: Array<Pick<KnowledgeProjectionNoteSource, 'relativePath' | 'blobSha' | 'markdownContent'>>;
  attachments?: KnowledgeProjectionAttachmentSource[];
}

export interface IKnowledgeProjectionEngine {
  applyChanges(
    connection: KnowledgeRemoteBindingServerDTO,
    commitSha: string,
    changeSet: KnowledgeProjectionChangeSet,
  ): Promise<void>;
  applySnapshot(
    connection: KnowledgeRemoteBindingServerDTO,
    commitSha: string,
    snapshot: KnowledgeProjectionSnapshot,
  ): Promise<void>;
}

export interface KnowledgeProjectionEngineOptions {
  projectionRepository: IKnowledgeNoteProjectionRepository;
  attachmentRepository?: IKnowledgeAttachmentProjectionRepository;
  documentIdentityRepository: IKnowledgeDocumentIdentityRepository;
  now?: () => number;
  publishMutation?: (event: RepositoryNoteMutationPayload) => void;
}

/**
 * Single application-owned write path for rebuildable Knowledge projections.
 *
 * Webhook ingestion, confirmed Git commits and periodic reconciliation may fetch
 * source data differently, but none may write projection tables, register
 * document identities or publish projection mutations directly. Callers must
 * already hold the connection-level Knowledge lease before invoking this engine.
 */
export class KnowledgeProjectionEngine implements IKnowledgeProjectionEngine {
  private readonly now: () => number;
  private readonly publishMutation: (event: RepositoryNoteMutationPayload) => void;

  constructor(private readonly options: KnowledgeProjectionEngineOptions) {
    this.now = options.now ?? Date.now;
    this.publishMutation = options.publishMutation ?? publishRepositoryNoteMutation;
  }

  async applyChanges(
    connection: KnowledgeRemoteBindingServerDTO,
    commitSha: string,
    changeSet: KnowledgeProjectionChangeSet,
  ): Promise<void> {
    const projections = changeSet.notes.map((note) =>
      this.toProjection(connection.id, commitSha, note),
    );
    const renamedFromPaths = changeSet.notes.flatMap((note) =>
      note.previousPath ? [note.previousPath] : [],
    );
    const allDeletedPaths = [...(changeSet.deletedPaths ?? []), ...renamedFromPaths];
    const previousAtUpsertPath = await Promise.all(
      changeSet.notes.map((note) =>
        this.options.projectionRepository.findByPath(connection.id, note.relativePath),
      ),
    );
    const deletedProjections = await Promise.all(
      allDeletedPaths.map((relativePath) =>
        this.options.projectionRepository.findByPath(connection.id, relativePath),
      ),
    );

    await this.validateAndRegisterDocumentIdentities(connection, projections, allDeletedPaths);
    await this.options.projectionRepository.applyChanges(
      connection.id,
      commitSha,
      projections,
      allDeletedPaths,
    );

    if (this.options.attachmentRepository) {
      const attachments = (changeSet.attachments ?? []).map((attachment) =>
        this.toAttachmentProjection(connection.id, commitSha, attachment),
      );
      const deletedAttachmentPaths = [
        ...(changeSet.deletedAttachmentPaths ?? []),
        ...(changeSet.attachments ?? []).flatMap((attachment) =>
          attachment.previousPath ? [attachment.previousPath] : [],
        ),
      ];
      await this.options.attachmentRepository.applyChanges(
        connection.id,
        commitSha,
        attachments,
        deletedAttachmentPaths,
      );
    }

    changeSet.notes.forEach((note, index) => {
      const projection = projections[index];
      if (!projection) return;
      const previous = previousAtUpsertPath[index];
      const mutation =
        note.mutation ??
        (previous?.deletedAt === null
          ? RepositoryNoteMutationType.ContentUpdated
          : RepositoryNoteMutationType.Created);
      this.publishProjectionMutation(connection, projection, mutation);

      if (note.previousPath) {
        const previousPathProjection = deletedProjections.find(
          (candidate) => candidate?.relativePath === note.previousPath,
        );
        if (
          !previousPathProjection?.knowledgeDocumentId ||
          previousPathProjection.knowledgeDocumentId !== projection.knowledgeDocumentId
        ) {
          this.publishDeletedProjectionMutation(
            connection,
            note.previousPath,
            previousPathProjection ?? null,
          );
        }
      }
    });

    for (const relativePath of changeSet.deletedPaths ?? []) {
      const previous = deletedProjections.find(
        (candidate) => candidate?.relativePath === relativePath,
      );
      this.publishDeletedProjectionMutation(connection, relativePath, previous ?? null);
    }
  }

  async applySnapshot(
    connection: KnowledgeRemoteBindingServerDTO,
    commitSha: string,
    snapshot: KnowledgeProjectionSnapshot,
  ): Promise<void> {
    const projections = snapshot.files.map((file) =>
      this.toProjection(connection.id, commitSha, file),
    );
    const attachments = (snapshot.attachments ?? []).map((file) =>
      this.toAttachmentProjection(connection.id, commitSha, file),
    );
    const previous = await this.options.projectionRepository.listLiveByConnection(connection.id);
    const nextPaths = new Set(projections.map((projection) => projection.relativePath));
    const deletedPaths = previous
      .filter((projection) => !nextPaths.has(projection.relativePath))
      .map((projection) => projection.relativePath);

    await this.validateAndRegisterDocumentIdentities(connection, projections, deletedPaths);
    const deleted = await this.options.projectionRepository.applySnapshot(
      connection.id,
      commitSha,
      projections,
    );
    if (this.options.attachmentRepository) {
      await this.options.attachmentRepository.applySnapshot(connection.id, commitSha, attachments);
    }

    projections.forEach((projection) =>
      this.publishProjectionMutation(
        connection,
        projection,
        RepositoryNoteMutationType.ContentUpdated,
      ),
    );
    const survivingManagedIds = new Set(
      projections.flatMap((projection) =>
        projection.knowledgeDocumentId ? [projection.knowledgeDocumentId] : [],
      ),
    );
    deleted
      .filter(
        (projection) =>
          !projection.knowledgeDocumentId ||
          !survivingManagedIds.has(projection.knowledgeDocumentId),
      )
      .forEach((projection) =>
        this.publishDeletedProjectionMutation(connection, projection.relativePath, projection),
      );
  }

  private toProjection(
    connectionId: string,
    commitSha: string,
    file: Pick<
      KnowledgeProjectionNoteSource,
      'projectionId' | 'relativePath' | 'blobSha' | 'markdownContent'
    >,
  ): KnowledgeNoteProjectionUpsert {
    let frontmatter: Record<string, unknown> = {};
    try {
      const parsed = matter(file.markdownContent);
      frontmatter = parsed.data as Record<string, unknown>;
    } catch {
      frontmatter = {};
    }
    const knowledgeDocumentId = readKnowledgeDocumentId(frontmatter);
    return {
      id:
        file.projectionId ??
        `knowledge-note-${createHash('sha256').update(`${connectionId}:${file.relativePath}`).digest('hex')}`,
      connectionId,
      knowledgeDocumentId,
      relativePath: file.relativePath,
      commitSha,
      blobSha: file.blobSha,
      contentHash: createHash('sha256').update(file.markdownContent).digest('hex'),
      frontmatter,
      markdownContent: file.markdownContent,
      indexStatus: 'pending',
    };
  }

  private toAttachmentProjection(
    connectionId: string,
    commitSha: string,
    file: KnowledgeProjectionAttachmentSource,
  ): KnowledgeAttachmentProjectionUpsert {
    return {
      id: `knowledge-attachment-${createHash('sha256').update(`${connectionId}:${file.relativePath}`).digest('hex')}`,
      connectionId,
      relativePath: file.relativePath,
      commitSha,
      blobSha: file.blobSha,
      byteSize: file.byteSize,
      mediaType: file.mediaType,
    };
  }

  private publishProjectionMutation(
    connection: KnowledgeRemoteBindingServerDTO,
    projection: KnowledgeNoteProjectionUpsert,
    mutation: RepositoryNoteMutationPayload['mutation'],
  ): void {
    this.publishMutation({
      identityId: connection.identityId as IdentityId,
      repositoryId: String(connection.id) as RepositoryId,
      resourceId: (projection.knowledgeDocumentId ?? projection.id) as ResourceId,
      resourcePath: projection.relativePath,
      mutation,
    });
  }

  private publishDeletedProjectionMutation(
    connection: KnowledgeRemoteBindingServerDTO,
    relativePath: string,
    projection: { id: string; knowledgeDocumentId: KnowledgeDocumentId | null } | null = null,
  ): void {
    const fallbackProjectionId = `knowledge-note-${createHash('sha256').update(`${connection.id}:${relativePath}`).digest('hex')}`;
    this.publishMutation({
      identityId: connection.identityId as IdentityId,
      repositoryId: String(connection.id) as RepositoryId,
      resourceId: (projection?.knowledgeDocumentId ??
        projection?.id ??
        fallbackProjectionId) as ResourceId,
      resourcePath: relativePath,
      mutation: RepositoryNoteMutationType.Deleted,
    });
  }

  private async validateAndRegisterDocumentIdentities(
    connection: KnowledgeRemoteBindingServerDTO,
    projections: KnowledgeNoteProjectionUpsert[],
    deletedPaths: string[],
  ): Promise<void> {
    const deleted = new Set(deletedPaths);
    const incomingManaged = projections.filter(
      (
        projection,
      ): projection is KnowledgeNoteProjectionUpsert & {
        knowledgeDocumentId: KnowledgeDocumentId;
      } => projection.knowledgeDocumentId !== null,
    );
    const incomingByDocumentId = new Map<KnowledgeDocumentId, string[]>();
    for (const projection of incomingManaged) {
      const paths = incomingByDocumentId.get(projection.knowledgeDocumentId) ?? [];
      paths.push(projection.relativePath);
      incomingByDocumentId.set(projection.knowledgeDocumentId, paths);
    }
    for (const [documentId, paths] of incomingByDocumentId) {
      if (new Set(paths).size > 1) {
        throw new KnowledgeDocumentIdentityConflictError(
          'KNOWLEDGE_DOCUMENT_ID_COLLISION',
          `Knowledge document identity ${documentId} appears at multiple live paths`,
        );
      }
    }

    for (const projection of projections) {
      const existingAtPath = await this.options.projectionRepository.findByPath(
        connection.id,
        projection.relativePath,
      );
      if (existingAtPath?.deletedAt === null && existingAtPath.knowledgeDocumentId) {
        if (!projection.knowledgeDocumentId) {
          throw new KnowledgeDocumentIdentityConflictError(
            'KNOWLEDGE_DOCUMENT_ID_REMOVED',
            `Managed knowledge document at ${projection.relativePath} lost its memoflow_id marker`,
          );
        }
        if (existingAtPath.knowledgeDocumentId !== projection.knowledgeDocumentId) {
          throw new KnowledgeDocumentIdentityConflictError(
            'KNOWLEDGE_DOCUMENT_ID_REPLACED',
            `Managed knowledge document at ${projection.relativePath} changed its memoflow_id marker`,
          );
        }
      }
      if (!projection.knowledgeDocumentId) continue;
      const liveMatches = await this.options.projectionRepository.findLiveByDocumentId(
        connection.id,
        projection.knowledgeDocumentId,
      );
      const collision = liveMatches.find(
        (candidate) =>
          candidate.relativePath !== projection.relativePath &&
          !deleted.has(candidate.relativePath),
      );
      if (collision) {
        throw new KnowledgeDocumentIdentityConflictError(
          'KNOWLEDGE_DOCUMENT_ID_COLLISION',
          `Knowledge document identity ${projection.knowledgeDocumentId} is already live at ${collision.relativePath}`,
        );
      }
      await this.options.documentIdentityRepository.observeMarker(
        connection.knowledgeSpaceId,
        projection.knowledgeDocumentId,
        this.now(),
      );
    }
  }
}
