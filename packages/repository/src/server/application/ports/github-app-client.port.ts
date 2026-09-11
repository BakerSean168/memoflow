import type { GitHubInstallationRepositoryDTO } from '@memoflow/contracts/repository';

export type GitHubAppClientFailure =
  | { readonly kind: 'not_found' }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'payload_too_large' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'rate_limited'; readonly retryAfterMs?: number }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'invalid_response' };

/** Provider-neutral failure emitted by the GitHub capability adapter. */
export class GitHubAppClientFailureError extends Error {
  constructor(
    readonly failure: GitHubAppClientFailure,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    if (options?.cause !== undefined) Object.assign(this, { cause: options.cause });
    this.name = 'GitHubAppClientFailureError';
  }
}

export interface GitHubAppInstallationInventory {
  installationId: string;
  accountId: string;
  contentsPermission: 'read' | 'write' | 'none';
  suspended: boolean;
  repositories: GitHubInstallationRepositoryDTO[];
}

export interface GitHubInstallationAccessToken {
  token: string;
  expiresAt: number;
}

export interface GitHubRepositorySnapshot {
  repositoryId: string;
  defaultBranch: string;
  empty: boolean;
  headSha: string | null;
}

export interface GitHubMarkdownChange {
  relativePath: string;
  previousPath?: string;
  blobSha: string | null;
  markdownContent: string | null;
  status: 'added' | 'modified' | 'renamed' | 'removed';
}

export interface GitHubAttachmentChange {
  relativePath: string;
  previousPath?: string;
  blobSha: string | null;
  byteSize: number | null;
  mediaType: string | null;
  status: 'added' | 'modified' | 'renamed' | 'removed';
}

export interface GitHubMarkdownChanges {
  commitSha: string;
  changes: GitHubMarkdownChange[];
  attachmentChanges?: GitHubAttachmentChange[];
  requiresFullSnapshot: boolean;
}

export interface GitHubMarkdownSnapshot {
  commitSha: string;
  files: Array<{ relativePath: string; blobSha: string; markdownContent: string }>;
  attachments?: Array<{
    relativePath: string;
    blobSha: string;
    byteSize: number | null;
    mediaType: string;
  }>;
}

export interface GitHubBlobContent {
  blobSha: string;
  byteSize: number;
  bytes: Uint8Array;
}

export interface GitHubFileCommitInput {
  repository: GitHubInstallationRepositoryDTO;
  path: string;
  branch: string;
  content: string;
  message: string;
  requestId: string;
}

export interface GitHubFileUpdateInput extends GitHubFileCommitInput {
  expectedBlobSha: string;
}

export interface GitHubFileCommitResult {
  commitSha: string;
  blobSha: string;
}

export interface IGitHubAppClient {
  getInstallationInventory(installationId: string): Promise<GitHubAppInstallationInventory>;
  getRepositorySnapshot(
    installationId: string,
    repository: GitHubInstallationRepositoryDTO,
  ): Promise<GitHubRepositorySnapshot>;
  getMarkdownChanges(
    installationId: string,
    repository: GitHubInstallationRepositoryDTO,
    beforeSha: string | null,
    afterSha: string,
  ): Promise<GitHubMarkdownChanges>;
  getFullMarkdownSnapshot(
    installationId: string,
    repository: GitHubInstallationRepositoryDTO,
    commitSha: string,
  ): Promise<GitHubMarkdownSnapshot>;
  getBlob(
    installationId: string,
    repository: GitHubInstallationRepositoryDTO,
    blobSha: string,
    maxBytes: number,
  ): Promise<GitHubBlobContent>;
  createFileCommit(
    installationId: string,
    input: GitHubFileCommitInput,
  ): Promise<GitHubFileCommitResult>;
  updateFileCommit(
    installationId: string,
    input: GitHubFileUpdateInput,
  ): Promise<GitHubFileCommitResult>;
  createInstallationAccessToken(
    installationId: string,
    repositoryId?: string,
  ): Promise<GitHubInstallationAccessToken>;
}
