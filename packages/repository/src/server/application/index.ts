/**
 * Repository Application Module (Server)
 *
 * Knowledge-repository runtime surface only. Legacy database Repository /
 * Folder / Resource / Bookmark use cases were removed with the Obsidian vault
 * migration; portable backup of old rows lives in data-portability.
 */

export type { RepositoryApplicationPort } from './repository.application.port';

// ===== Services =====
export * from './services';

// ===== Ports =====
export * from './ports/i-storage-port';
export * from './ports/github-app-client.port';
export * from './ports/knowledge-remote-binding.repositories';
export * from './ports/knowledge-document-identity.repository';
export * from './ports/knowledge-note-projection.repository';
export * from './ports/knowledge-attachment-projection.repository';
export * from './ports/knowledge-attachment-content-cache.port';
export * from './ports/knowledge-repository-lease.repository';
export * from './ports/knowledge-repository-cloud-data-purger.port';
