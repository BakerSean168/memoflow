import { MAX_KNOWLEDGE_ATTACHMENT_BYTES } from '@memoflow/repository-contracts';
import type {
  GitHubInstallationRepositoryDTO,
  KnowledgeAttachmentContentResponse,
  KnowledgeRemoteBindingServerDTO,
} from '@memoflow/repository-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { GitHubAppClientFailureError } from '../ports/github-app-client.port';
import type { GitHubBlobContent, IGitHubAppClient } from '../ports/github-app-client.port';
import type { IKnowledgeAttachmentProjectionRepository } from '../ports/knowledge-attachment-projection.repository';
import type {
  IKnowledgeAttachmentContentCache,
  KnowledgeAttachmentContentCacheEntry,
} from '../ports/knowledge-attachment-content-cache.port';
import type { IKnowledgeRemoteBindingRepository } from '../ports/knowledge-remote-binding.repositories';

const logger = createLogger('KnowledgeRepositoryProjectionService');
const DEFAULT_ATTACHMENT_CACHE_TTL_MS = 60 * 60 * 1_000;

export interface KnowledgeAttachmentContentReaderOptions {
  connectionRepository: IKnowledgeRemoteBindingRepository;
  attachmentRepository?: IKnowledgeAttachmentProjectionRepository;
  attachmentContentCache?: IKnowledgeAttachmentContentCache;
  attachmentCacheTtlMs?: number;
  githubAppClient: IGitHubAppClient;
  now: () => number;
  findRepository: (
    repositories: GitHubInstallationRepositoryDTO[],
    connection: KnowledgeRemoteBindingServerDTO,
  ) => GitHubInstallationRepositoryDTO | null;
}

/**
 * Reads bounded attachment bytes for one projected attachment, sharing a
 * per-service in-flight map and the optional shared content cache.
 */
export class KnowledgeAttachmentContentReader {
  private readonly options: KnowledgeAttachmentContentReaderOptions;
  private readonly now: () => number;
  private readonly attachmentCacheTtlMs: number;
  private readonly attachmentBlobLoads = new Map<string, Promise<GitHubBlobContent>>();
  private readonly findRepository: KnowledgeAttachmentContentReaderOptions['findRepository'];

  constructor(options: KnowledgeAttachmentContentReaderOptions) {
    this.options = options;
    this.now = options.now;
    this.attachmentCacheTtlMs = Math.max(
      1_000,
      options.attachmentCacheTtlMs ?? DEFAULT_ATTACHMENT_CACHE_TTL_MS,
    );
    this.findRepository = options.findRepository;
  }

  async getAttachmentContent(
    identityId: string,
    projectionId: string,
  ): Promise<Result<KnowledgeAttachmentContentResponse>> {
    if (!this.options.attachmentRepository) {
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Knowledge attachment projections are not configured',
      });
    }
    const attachment = await this.options.attachmentRepository.findByIdForIdentity(
      identityId,
      projectionId,
    );
    if (!attachment) {
      return fail({ code: 'NOT_FOUND', message: 'Knowledge attachment was not found' });
    }
    if (attachment.byteSize !== null && attachment.byteSize > MAX_KNOWLEDGE_ATTACHMENT_BYTES) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Knowledge attachment exceeds the 10 MiB read limit',
      });
    }

    const connection = await this.options.connectionRepository.findByIdForIdentity(
      identityId,
      attachment.connectionId,
    );
    if (!connection || connection.disconnectedAt !== null) {
      return fail({ code: 'NOT_FOUND', message: 'Knowledge attachment was not found' });
    }
    try {
      const inventory = await this.options.githubAppClient.getInstallationInventory(
        connection.installationId,
      );
      const repository = this.findRepository(inventory.repositories, connection);
      if (
        inventory.suspended ||
        inventory.contentsPermission === 'none' ||
        !repository ||
        !repository.private ||
        repository.archived ||
        repository.disabled
      ) {
        return fail({
          code: 'FORBIDDEN',
          message: 'Knowledge repository attachment access is no longer authorized',
        });
      }
      const blob = await this.loadAttachmentBlob(
        connection.id,
        connection.installationId,
        repository,
        attachment.blobSha,
      );
      const current = await this.options.attachmentRepository.findByIdForIdentity(
        identityId,
        projectionId,
      );
      if (!current || current.blobSha !== attachment.blobSha) {
        return fail({
          code: 'CONFLICT',
          message: 'Knowledge attachment changed while it was being read',
        });
      }
      if (attachment.byteSize !== null && attachment.byteSize !== blob.byteSize) {
        return fail({
          code: 'CONFLICT',
          message: 'Knowledge attachment size no longer matches its projection',
        });
      }
      return ok({ attachment: current, contentBase64: Buffer.from(blob.bytes).toString('base64') });
    } catch (error) {
      if (error instanceof GitHubAppClientFailureError) {
        if (error.failure.kind === 'payload_too_large') {
          return fail({
            code: 'VALIDATION_ERROR',
            message: 'Knowledge attachment exceeds the 10 MiB read limit',
          });
        }
        if (error.failure.kind === 'unauthorized') {
          return fail({
            code: 'FORBIDDEN',
            message: 'Knowledge repository attachment access is no longer authorized',
          });
        }
        if (error.failure.kind === 'not_found') {
          return fail({ code: 'NOT_FOUND', message: 'Knowledge attachment blob was not found' });
        }
      }
      logger.warn('Knowledge attachment read failed', {
        error,
        attachmentId: projectionId,
        connectionId: connection.id,
      });
      return fail({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Knowledge attachment is temporarily unavailable',
      });
    }
  }

  private async loadAttachmentBlob(
    connectionId: string,
    installationId: string,
    repository: GitHubInstallationRepositoryDTO,
    blobSha: string,
  ): Promise<GitHubBlobContent> {
    const cache = this.options.attachmentContentCache;
    if (cache) {
      const cached = await this.readCachedAttachment(cache, connectionId, blobSha);
      if (cached) return cached;
    }

    const key = `${connectionId}:${blobSha}`;
    const existing = this.attachmentBlobLoads.get(key);
    if (existing) return existing;

    const load = (async (): Promise<GitHubBlobContent> => {
      if (cache) {
        const cached = await this.readCachedAttachment(cache, connectionId, blobSha);
        if (cached) return cached;
      }

      const blob = await this.options.githubAppClient.getBlob(
        installationId,
        repository,
        blobSha,
        MAX_KNOWLEDGE_ATTACHMENT_BYTES,
      );
      this.assertAttachmentBlobIntegrity(blob, blobSha);

      if (cache) {
        const cachedAt = this.now();
        const entry: KnowledgeAttachmentContentCacheEntry = {
          connectionId,
          blobSha,
          byteSize: blob.byteSize,
          bytes: blob.bytes,
          cachedAt,
          expiresAt: cachedAt + this.attachmentCacheTtlMs,
        };
        await cache.save(entry).catch((error) => {
          logger.warn('Knowledge attachment cache write failed', {
            error,
            connectionId,
            blobSha,
          });
        });
      }
      return blob;
    })();
    this.attachmentBlobLoads.set(key, load);
    try {
      return await load;
    } finally {
      if (this.attachmentBlobLoads.get(key) === load) this.attachmentBlobLoads.delete(key);
    }
  }

  private async readCachedAttachment(
    cache: IKnowledgeAttachmentContentCache,
    connectionId: string,
    blobSha: string,
  ): Promise<GitHubBlobContent | null> {
    let entry: KnowledgeAttachmentContentCacheEntry | null;
    try {
      entry = await cache.find(connectionId, blobSha, this.now());
    } catch (error) {
      logger.warn('Knowledge attachment cache read failed', { error, connectionId, blobSha });
      return null;
    }
    if (!entry) return null;

    try {
      if (
        entry.connectionId !== connectionId ||
        entry.blobSha !== blobSha ||
        entry.byteSize !== entry.bytes.byteLength ||
        entry.byteSize > MAX_KNOWLEDGE_ATTACHMENT_BYTES
      ) {
        throw new Error('Cached attachment bytes failed integrity validation');
      }
      return { blobSha, byteSize: entry.byteSize, bytes: entry.bytes };
    } catch (error) {
      logger.warn('Knowledge attachment cache entry was invalid', { error, connectionId, blobSha });
      await cache.remove(connectionId, blobSha).catch(() => undefined);
      return null;
    }
  }

  private assertAttachmentBlobIntegrity(blob: GitHubBlobContent, expectedBlobSha: string): void {
    if (blob.byteSize > MAX_KNOWLEDGE_ATTACHMENT_BYTES) {
      throw new GitHubAppClientFailureError(
        { kind: 'payload_too_large' },
        'Knowledge attachment exceeds the 10 MiB read limit',
      );
    }
    if (blob.blobSha !== expectedBlobSha || blob.byteSize !== blob.bytes.byteLength) {
      throw new Error('GitHub attachment blob failed integrity validation');
    }
  }
}
