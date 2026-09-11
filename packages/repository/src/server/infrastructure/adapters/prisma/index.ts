/**
 * Repository Prisma adapters (knowledge runtime).
 *
 * Legacy Folder/Resource/Repository/Bookmark Prisma adapters were removed with
 * the Obsidian vault migration. Portable backup uses data-portability Prisma
 * writes against table schemas, not these domain repositories.
 */

export {
  KnowledgeSpacePrismaRepository,
  KnowledgeRemoteBindingPrismaRepository,
  RemoteRepositoryObservationPrismaRepository,
  RemoteHistoryFencePrismaRepository,
  KnowledgeProjectionCheckpointPrismaRepository,
} from './knowledge-remote-binding-prisma.repositories';
export { GithubWebhookDeliveryPrismaRepository } from './github-webhook-delivery-prisma.repository';
export { KnowledgeNoteProjectionPrismaRepository } from './knowledge-note-projection-prisma.repository';
export { KnowledgeAttachmentProjectionPrismaRepository } from './knowledge-attachment-projection-prisma.repository';
export { KnowledgeAttachmentContentCachePrismaRepository } from './knowledge-attachment-content-cache-prisma.repository';
export { KnowledgeWriteRequestPrismaRepository } from './knowledge-write-request-prisma.repository';
export { KnowledgeRepositoryLeasePrismaRepository } from './knowledge-repository-lease-prisma.repository';
