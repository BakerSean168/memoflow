import type { PrismaClient } from '@memoflow/database';
import type {
  ServerHeldAiKnowledgeIndexEntry,
  ServerHeldDataDisclosureDataV1,
  ServerHeldGithubWebhookDelivery,
  ServerHeldKnowledgeAttachmentContentCache,
  ServerHeldKnowledgeAttachmentProjection,
  ServerHeldKnowledgeDocumentIdentity,
  ServerHeldKnowledgeNoteProjection,
  ServerHeldKnowledgeSpace,
  ServerHeldKnowledgeRemoteBinding,
  ServerHeldRemoteRepositoryObservation,
  ServerHeldRemoteHistoryFence,
  ServerHeldKnowledgeProjectionCheckpoint,
  ServerHeldKnowledgeWriteRequest,
} from '@memoflow/contracts/data-portability';
import {
  KnowledgeDocumentIdSchema,
  KnowledgeDocumentIdentityOriginSchema,
} from '@memoflow/contracts/repository';
import type { ServerHeldDataDisclosureSource } from '../application/server-held-data-disclosure.source';

function iso(value: Date): string {
  return value.toISOString();
}

function nullableIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

/**
 * Prisma-backed disclosure source.
 *
 * Every query uses an explicit scalar allowlist. In particular, this source
 * never reads authentication bindings, encrypted credentials, GitHub App
 * private keys, OAuth tokens, or installation access tokens.
 */
export class PrismaServerHeldDataDisclosureSource implements ServerHeldDataDisclosureSource {
  constructor(private readonly db: PrismaClient) {}

  async readForIdentity(identityId: string): Promise<ServerHeldDataDisclosureDataV1> {
    const [bindings, aiKnowledgeIndexEntries] = await Promise.all([
      this.db.knowledgeRemoteBinding.findMany({
        where: { identityId },
        orderBy: [{ connectedAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          knowledgeSpaceId: true,
          provider: true,
          installationId: true,
          repositoryId: true,
          repositoryFullNameSnapshot: true,
          connectedAt: true,
          disconnectedAt: true,
          version: true,
          knowledgeSpace: {
            select: {
              id: true,
              createdAt: true,
              updatedAt: true,
              documentIdentities: {
                orderBy: [{ knowledgeDocumentId: 'asc' }],
                select: {
                  knowledgeSpaceId: true,
                  knowledgeDocumentId: true,
                  origin: true,
                  originRequestId: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
          observation: {
            select: {
              bindingId: true,
              observedAt: true,
              accountId: true,
              repositoryFullName: true,
              defaultBranch: true,
              isPrivate: true,
              archived: true,
              disabled: true,
              contentsPermission: true,
              installationSuspended: true,
              eligibilityState: true,
              blockReason: true,
            },
          },
          historyFence: {
            select: {
              bindingId: true,
              defaultBranch: true,
              lastConfirmedRemoteHeadSha: true,
              confirmedAt: true,
            },
          },
          projectionCheckpoint: {
            select: {
              bindingId: true,
              branch: true,
              projectedCommitSha: true,
              state: true,
              failureCode: true,
              failureMessage: true,
              lastAttemptAt: true,
              projectedAt: true,
            },
          },
          webhookDeliveries: {
            orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              bindingId: true,
              deliveryId: true,
              eventName: true,
              beforeSha: true,
              afterSha: true,
              forced: true,
              status: true,
              errorMessage: true,
              receivedAt: true,
              processedAt: true,
            },
          },
          noteProjections: {
            orderBy: [{ relativePath: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              bindingId: true,
              knowledgeDocumentId: true,
              relativePath: true,
              commitSha: true,
              blobSha: true,
              contentHash: true,
              frontmatter: true,
              markdownContent: true,
              indexStatus: true,
              createdAt: true,
              updatedAt: true,
              deletedAt: true,
            },
          },
          attachmentProjections: {
            orderBy: [{ relativePath: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              bindingId: true,
              relativePath: true,
              commitSha: true,
              blobSha: true,
              byteSize: true,
              mediaType: true,
              createdAt: true,
              updatedAt: true,
              deletedAt: true,
            },
          },
          attachmentContentCaches: {
            orderBy: [{ cachedAt: 'asc' }, { blobSha: 'asc' }],
            select: {
              bindingId: true,
              blobSha: true,
              byteSize: true,
              contentBytes: true,
              cachedAt: true,
              expiresAt: true,
            },
          },
          writeRequests: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              bindingId: true,
              knowledgeDocumentId: true,
              requestId: true,
              requestHash: true,
              relativePath: true,
              status: true,
              commitSha: true,
              errorCode: true,
              errorMessage: true,
              createdAt: true,
              updatedAt: true,
              completedAt: true,
            },
          },
        },
      }),
      this.db.aiKnowledgeIndexEntry.findMany({
        where: { identityId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          repositoryId: true,
          resourceId: true,
          resourcePath: true,
          title: true,
          mimeType: true,
          contentHash: true,
          status: true,
          summary: true,
          keywords: true,
          embedding: true,
          chunks: true,
          metadata: true,
          error: true,
          indexedAt: true,
          lastRequestedAt: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      }),
    ]);

    const spaces = new Map<string, ServerHeldKnowledgeSpace>();
    const documentIdentities = new Map<string, ServerHeldKnowledgeDocumentIdentity>();
    for (const binding of bindings) {
      spaces.set(binding.knowledgeSpace.id, {
        id: binding.knowledgeSpace.id,
        createdAt: iso(binding.knowledgeSpace.createdAt),
        updatedAt: iso(binding.knowledgeSpace.updatedAt),
      });
      for (const identity of binding.knowledgeSpace.documentIdentities) {
        const key = `${identity.knowledgeSpaceId}:${identity.knowledgeDocumentId}`;
        documentIdentities.set(key, {
          knowledgeSpaceId: identity.knowledgeSpaceId,
          knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(identity.knowledgeDocumentId),
          origin: KnowledgeDocumentIdentityOriginSchema.parse(identity.origin),
          originRequestId: identity.originRequestId,
          createdAt: iso(identity.createdAt),
          updatedAt: iso(identity.updatedAt),
        });
      }
    }

    return {
      knowledgeSpaces: [...spaces.values()].sort((a, b) => a.id.localeCompare(b.id)),
      knowledgeDocumentIdentities: [...documentIdentities.values()].sort(
        (a, b) =>
          a.knowledgeSpaceId.localeCompare(b.knowledgeSpaceId) ||
          a.knowledgeDocumentId.localeCompare(b.knowledgeDocumentId),
      ),
      knowledgeRemoteBindings: bindings.map((binding): ServerHeldKnowledgeRemoteBinding => ({
        id: binding.id,
        knowledgeSpaceId: binding.knowledgeSpaceId,
        provider: binding.provider,
        installationId: binding.installationId,
        repositoryId: binding.repositoryId,
        repositoryFullNameSnapshot: binding.repositoryFullNameSnapshot,
        connectedAt: iso(binding.connectedAt),
        disconnectedAt: nullableIso(binding.disconnectedAt),
        version: binding.version,
      })),
      remoteRepositoryObservations: bindings.flatMap((binding) =>
        binding.observation
          ? [
              {
                bindingId: binding.observation.bindingId,
                observedAt: iso(binding.observation.observedAt),
                accountId: binding.observation.accountId,
                repositoryFullName: binding.observation.repositoryFullName,
                defaultBranch: binding.observation.defaultBranch,
                private: binding.observation.isPrivate,
                archived: binding.observation.archived,
                disabled: binding.observation.disabled,
                contentsPermission: binding.observation.contentsPermission,
                installationSuspended: binding.observation.installationSuspended,
                eligibilityState: binding.observation.eligibilityState,
                blockReason: binding.observation.blockReason,
              } satisfies ServerHeldRemoteRepositoryObservation,
            ]
          : [],
      ),
      remoteHistoryFences: bindings.flatMap((binding) =>
        binding.historyFence
          ? [
              {
                bindingId: binding.historyFence.bindingId,
                defaultBranch: binding.historyFence.defaultBranch,
                lastConfirmedRemoteHeadSha: binding.historyFence.lastConfirmedRemoteHeadSha,
                confirmedAt: iso(binding.historyFence.confirmedAt),
              } satisfies ServerHeldRemoteHistoryFence,
            ]
          : [],
      ),
      knowledgeProjectionCheckpoints: bindings.flatMap((binding) =>
        binding.projectionCheckpoint
          ? [
              {
                bindingId: binding.projectionCheckpoint.bindingId,
                branch: binding.projectionCheckpoint.branch,
                projectedCommitSha: binding.projectionCheckpoint.projectedCommitSha,
                state: binding.projectionCheckpoint.state,
                failureCode: binding.projectionCheckpoint.failureCode,
                failureMessage: binding.projectionCheckpoint.failureMessage,
                lastAttemptAt: nullableIso(binding.projectionCheckpoint.lastAttemptAt),
                projectedAt: nullableIso(binding.projectionCheckpoint.projectedAt),
              } satisfies ServerHeldKnowledgeProjectionCheckpoint,
            ]
          : [],
      ),
      githubWebhookDeliveries: bindings.flatMap((binding) =>
        binding.webhookDeliveries.map((delivery): ServerHeldGithubWebhookDelivery => ({
          ...delivery,
          receivedAt: iso(delivery.receivedAt),
          processedAt: nullableIso(delivery.processedAt),
        })),
      ),
      knowledgeNoteProjections: bindings.flatMap((binding) =>
        binding.noteProjections.map((projection): ServerHeldKnowledgeNoteProjection => ({
          ...projection,
          knowledgeDocumentId: projection.knowledgeDocumentId
            ? KnowledgeDocumentIdSchema.parse(projection.knowledgeDocumentId)
            : null,
          createdAt: iso(projection.createdAt),
          updatedAt: iso(projection.updatedAt),
          deletedAt: nullableIso(projection.deletedAt),
        })),
      ),
      knowledgeAttachmentProjections: bindings.flatMap((binding) =>
        binding.attachmentProjections.map(
          (projection): ServerHeldKnowledgeAttachmentProjection => ({
            ...projection,
            createdAt: iso(projection.createdAt),
            updatedAt: iso(projection.updatedAt),
            deletedAt: nullableIso(projection.deletedAt),
          }),
        ),
      ),
      knowledgeAttachmentContentCaches: bindings.flatMap((binding) =>
        binding.attachmentContentCaches.map((entry): ServerHeldKnowledgeAttachmentContentCache => ({
          bindingId: entry.bindingId,
          blobSha: entry.blobSha,
          byteSize: entry.byteSize,
          contentBase64: Buffer.from(entry.contentBytes).toString('base64'),
          cachedAt: iso(entry.cachedAt),
          expiresAt: iso(entry.expiresAt),
        })),
      ),
      knowledgeWriteRequests: bindings.flatMap((binding) =>
        binding.writeRequests.map((request): ServerHeldKnowledgeWriteRequest => ({
          ...request,
          knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(request.knowledgeDocumentId),
          createdAt: iso(request.createdAt),
          updatedAt: iso(request.updatedAt),
          completedAt: nullableIso(request.completedAt),
        })),
      ),
      aiKnowledgeIndexEntries: aiKnowledgeIndexEntries.map(
        (entry): ServerHeldAiKnowledgeIndexEntry => ({
          ...entry,
          indexedAt: iso(entry.indexedAt),
          lastRequestedAt: nullableIso(entry.lastRequestedAt),
          createdAt: iso(entry.createdAt),
          updatedAt: iso(entry.updatedAt),
          deletedAt: nullableIso(entry.deletedAt),
        }),
      ),
    };
  }
}
