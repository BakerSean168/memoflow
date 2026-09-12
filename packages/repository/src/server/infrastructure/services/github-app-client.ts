import { createSign } from 'node:crypto';
import type { GitHubInstallationRepositoryDTO } from '@memoflow/contracts/repository';
import { GitHubAppClientFailureError } from '../../application/ports/github-app-client.port';
import type {
  GitHubAppInstallationInventory,
  GitHubBlobContent,
  GitHubFileCommitInput,
  GitHubFileUpdateInput,
  GitHubFileCommitResult,
  GitHubInstallationAccessToken,
  GitHubMarkdownChanges,
  GitHubMarkdownSnapshot,
  GitHubRepositorySnapshot,
  IGitHubAppClient,
} from '../../application/ports/github-app-client.port';
import { resolveKnowledgeAttachmentMediaType } from '../../application/services/knowledge-attachment-policy';

export interface GitHubAppClientOptions {
  appId: string;
  privateKey: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface GitHubInstallationResponse {
  id: number;
  account?: { id?: number };
  permissions?: { contents?: string };
  suspended_at?: string | null;
}

interface GitHubRepositoryResponse {
  id: number;
  node_id?: string;
  full_name?: string;
  private?: boolean;
  archived?: boolean;
  disabled?: boolean;
  default_branch?: string;
  owner?: { id?: number };
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
}

interface GitHubInstallationTokenResponse {
  token?: string;
  expires_at?: string;
}

interface GitHubRepositorySnapshotResponse {
  data?: {
    node?: {
      id?: string;
      isEmpty?: boolean;
      defaultBranchRef?: {
        name?: string;
        target?: {
          oid?: string;
          tree?: {
            entries?: Array<{ name?: string; type?: string }>;
          };
        };
      } | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
}

interface GitHubCompareFileResponse {
  filename?: string;
  previous_filename?: string;
  status?: string;
  sha?: string;
  size?: number;
}

interface GitHubTreeResponse {
  sha?: string;
  tree?: Array<{ path?: string; type?: string; sha?: string; size?: number }>;
  truncated?: boolean;
}

interface GitHubBlobResponse {
  sha?: string;
  size?: number;
  encoding?: string;
  content?: string;
}

interface GitHubRefResponse {
  object?: { sha?: string };
}

interface GitHubCommitResponse {
  sha?: string;
  tree?: { sha?: string };
}

interface GitHubContentsResponse {
  type?: string;
  sha?: string;
  content?: string;
  encoding?: string;
}

const REPOSITORY_SCAFFOLD_ROOT_ENTRIES = new Set([
  '.gitignore',
  '.memory-flow',
  '.obsidian',
  '.trash',
  '.Trash',
  'README.md',
]);

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function mapGitHubHttpStatusToFailure(
  status: number,
  retryAfterHeader: string | null,
): import('../../application/ports/github-app-client.port').GitHubAppClientFailure {
  if (status == 401 || status == 403) return { kind: 'unauthorized' };
  if (status == 404) return { kind: 'not_found' };
  if (status == 409 || status == 422) return { kind: 'conflict' };
  if (status == 413) return { kind: 'payload_too_large' };
  if (status == 429) {
    const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : Number.NaN;
    return Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
      ? { kind: 'rate_limited', retryAfterMs: retryAfterSeconds * 1000 }
      : { kind: 'rate_limited' };
  }
  return { kind: 'unavailable' };
}

export class GitHubAppClient implements IGitHubAppClient {
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: GitHubAppClientOptions) {
    this.apiBaseUrl = (options.apiBaseUrl ?? 'https://api.github.com').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async getInstallationInventory(installationId: string): Promise<GitHubAppInstallationInventory> {
    const installation = await this.requestJson<GitHubInstallationResponse>(
      `/app/installations/${encodeURIComponent(installationId)}`,
      { authorization: `Bearer ${this.createAppJwt()}` },
    );
    if (!installation.id || !installation.account?.id) {
      throw new Error('GitHub returned an invalid installation payload');
    }
    const contentsPermission =
      installation.permissions?.contents === 'write'
        ? 'write'
        : installation.permissions?.contents === 'read'
          ? 'read'
          : 'none';
    const suspended = Boolean(installation.suspended_at);
    if (suspended || contentsPermission !== 'write') {
      return {
        installationId: String(installation.id),
        accountId: String(installation.account.id),
        contentsPermission,
        suspended,
        repositories: [],
      };
    }
    const accessToken = await this.createInstallationAccessToken(installationId);
    const repositories: GitHubInstallationRepositoryDTO[] = [];

    for (let page = 1; page <= 10; page += 1) {
      const response = await this.requestJson<{ repositories?: GitHubRepositoryResponse[] }>(
        `/installation/repositories?per_page=100&page=${page}`,
        { authorization: `Bearer ${accessToken.token}` },
      );
      const batch = (response.repositories ?? []).map((repository) =>
        this.toRepository(repository, contentsPermission),
      );
      repositories.push(...batch);
      if (batch.length < 100) break;
    }

    return {
      installationId: String(installation.id),
      accountId: String(installation.account?.id ?? ''),
      contentsPermission,
      suspended,
      repositories,
    };
  }

  async createInstallationAccessToken(
    installationId: string,
    repositoryId?: string,
  ): Promise<GitHubInstallationAccessToken> {
    const numericRepositoryId = repositoryId ? Number(repositoryId) : undefined;
    if (repositoryId && (!Number.isSafeInteger(numericRepositoryId) || numericRepositoryId! <= 0)) {
      throw new Error('GitHub repository id must be a positive integer');
    }
    const response = await this.requestJson<GitHubInstallationTokenResponse>(
      `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      { authorization: `Bearer ${this.createAppJwt()}` },
      'POST',
      numericRepositoryId ? { repository_ids: [numericRepositoryId] } : undefined,
    );
    const expiresAt = response.expires_at ? Date.parse(response.expires_at) : Number.NaN;
    if (!response.token || !Number.isFinite(expiresAt) || expiresAt <= this.now()) {
      throw new Error('GitHub returned an invalid installation token response');
    }
    return {
      token: response.token,
      expiresAt,
    };
  }

  async getRepositorySnapshot(
    installationId: string,
    repository: GitHubInstallationRepositoryDTO,
  ): Promise<GitHubRepositorySnapshot> {
    if (!repository.nodeId) {
      throw new Error('GitHub repository node id is required for reconciliation');
    }
    const accessToken = await this.createInstallationAccessToken(installationId, repository.id);
    const response = await this.requestJson<GitHubRepositorySnapshotResponse>(
      '/graphql',
      { authorization: `Bearer ${accessToken.token}` },
      'POST',
      {
        query: `
          query KnowledgeRepositorySnapshot($repositoryId: ID!) {
            node(id: $repositoryId) {
              ... on Repository {
                id
                isEmpty
                defaultBranchRef {
                  name
                  target {
                    ... on Commit {
                      oid
                      tree {
                        entries {
                          name
                          type
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { repositoryId: repository.nodeId },
      },
    );

    const graphqlError = response.errors?.find((error) => error.message)?.message;
    if (graphqlError) {
      throw new Error(`GitHub GraphQL: ${graphqlError}`);
    }
    const node = response.data?.node;
    if (!node || node.id !== repository.nodeId || typeof node.isEmpty !== 'boolean') {
      throw new Error('GitHub returned an invalid repository snapshot');
    }
    if (node.isEmpty) {
      return {
        repositoryId: repository.id,
        defaultBranch: repository.defaultBranch,
        empty: true,
        headSha: null,
      };
    }

    const branch = node.defaultBranchRef;
    const entries = branch?.target?.tree?.entries;
    if (!branch?.name || !branch.target?.oid || !Array.isArray(entries)) {
      throw new Error('GitHub returned an invalid default branch snapshot');
    }
    const empty = entries.every(
      (entry) => typeof entry.name === 'string' && REPOSITORY_SCAFFOLD_ROOT_ENTRIES.has(entry.name),
    );
    return {
      repositoryId: repository.id,
      defaultBranch: branch.name,
      empty,
      headSha: branch.target.oid,
    };
  }

  async getMarkdownChanges(
    installationId: string,
    repository: GitHubInstallationRepositoryDTO,
    beforeSha: string | null,
    afterSha: string,
  ): Promise<GitHubMarkdownChanges> {
    if (!beforeSha || /^0+$/.test(beforeSha)) {
      return {
        commitSha: afterSha,
        changes: [],
        attachmentChanges: [],
        requiresFullSnapshot: true,
      };
    }
    const accessToken = await this.createInstallationAccessToken(installationId, repository.id);
    const response = await this.requestJson<{
      files?: GitHubCompareFileResponse[];
      status?: string;
    }>(
      `/repos/${this.encodeRepository(repository)}/compare/${encodeURIComponent(beforeSha)}...${encodeURIComponent(afterSha)}`,
      { authorization: `Bearer ${accessToken.token}` },
    );
    const files = response.files ?? [];
    // GitHub truncates compare results at 300 files. A full tree is the only
    // correct fallback because a dropped deletion must not survive in the read model.
    if (files.length >= 300 || response.status === 'diverged') {
      return {
        commitSha: afterSha,
        changes: [],
        attachmentChanges: [],
        requiresFullSnapshot: true,
      };
    }
    const changes: GitHubMarkdownChanges['changes'] = [];
    const attachmentChanges: GitHubMarkdownChanges['attachmentChanges'] = [];
    for (const file of files) {
      if (!file.filename) continue;
      const currentIsMarkdown = this.isMarkdownPath(file.filename);
      const previousIsMarkdown = Boolean(
        file.previous_filename && this.isMarkdownPath(file.previous_filename),
      );
      const currentMediaType = resolveKnowledgeAttachmentMediaType(file.filename);
      const previousMediaType = file.previous_filename
        ? resolveKnowledgeAttachmentMediaType(file.previous_filename)
        : null;
      const status = file.status ?? 'modified';
      if (status === 'removed') {
        if (currentIsMarkdown || previousIsMarkdown) {
          changes.push({
            relativePath: file.previous_filename ?? file.filename,
            blobSha: null,
            markdownContent: null,
            status: 'removed',
          });
        }
        if (currentMediaType || previousMediaType) {
          attachmentChanges.push({
            relativePath: file.previous_filename ?? file.filename,
            blobSha: null,
            byteSize: null,
            mediaType: previousMediaType ?? currentMediaType,
            status: 'removed',
          });
        }
        continue;
      }
      if (previousIsMarkdown && !currentIsMarkdown) {
        changes.push({
          relativePath: file.previous_filename!,
          blobSha: null,
          markdownContent: null,
          status: 'removed',
        });
      }
      if (previousMediaType && !currentMediaType) {
        attachmentChanges.push({
          relativePath: file.previous_filename!,
          blobSha: null,
          byteSize: null,
          mediaType: previousMediaType,
          status: 'removed',
        });
      }
      const normalizedStatus =
        status === 'renamed' ? 'renamed' : status === 'added' ? 'added' : 'modified';
      if (currentIsMarkdown && file.sha) {
        changes.push({
          relativePath: file.filename,
          previousPath: previousIsMarkdown ? file.previous_filename : undefined,
          blobSha: file.sha,
          markdownContent: await this.getBlobContent(accessToken.token, repository, file.sha),
          status: normalizedStatus,
        });
      }
      if (currentMediaType && file.sha) {
        attachmentChanges.push({
          relativePath: file.filename,
          previousPath: previousMediaType ? file.previous_filename : undefined,
          blobSha: file.sha,
          byteSize: Number.isSafeInteger(file.size) && file.size! >= 0 ? file.size! : null,
          mediaType: currentMediaType,
          status: normalizedStatus,
        });
      }
    }
    return { commitSha: afterSha, changes, attachmentChanges, requiresFullSnapshot: false };
  }

  async getFullMarkdownSnapshot(
    installationId: string,
    repository: GitHubInstallationRepositoryDTO,
    commitSha: string,
  ): Promise<GitHubMarkdownSnapshot> {
    const accessToken = await this.createInstallationAccessToken(installationId, repository.id);
    const tree = await this.requestJson<GitHubTreeResponse>(
      `/repos/${this.encodeRepository(repository)}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`,
      { authorization: `Bearer ${accessToken.token}` },
    );
    if (tree.truncated) {
      throw new Error('GitHub repository tree is too large for a safe projection rebuild');
    }
    const blobs = (tree.tree ?? []).filter(
      (entry): entry is { path: string; type: string; sha: string; size?: number } =>
        entry.type === 'blob' && typeof entry.path === 'string' && Boolean(entry.sha),
    );
    const files = blobs.filter((entry) => this.isMarkdownPath(entry.path));
    const result: GitHubMarkdownSnapshot['files'] = [];
    for (let index = 0; index < files.length; index += 10) {
      const batch = files.slice(index, index + 10);
      const contents = await Promise.all(
        batch.map(async (entry) => ({
          relativePath: entry.path,
          blobSha: entry.sha,
          markdownContent: await this.getBlobContent(accessToken.token, repository, entry.sha),
        })),
      );
      result.push(...contents);
    }
    const attachments = blobs.flatMap((entry) => {
      const mediaType = resolveKnowledgeAttachmentMediaType(entry.path);
      return mediaType
        ? [
            {
              relativePath: entry.path,
              blobSha: entry.sha,
              byteSize: Number.isSafeInteger(entry.size) && entry.size! >= 0 ? entry.size! : null,
              mediaType,
            },
          ]
        : [];
    });
    return { commitSha, files: result, attachments };
  }

  async getBlob(
    installationId: string,
    repository: GitHubInstallationRepositoryDTO,
    blobSha: string,
    maxBytes: number,
  ): Promise<GitHubBlobContent> {
    const accessToken = await this.createInstallationAccessToken(installationId, repository.id);
    return this.getBlobWithToken(accessToken.token, repository, blobSha, maxBytes);
  }

  async createFileCommit(
    installationId: string,
    input: GitHubFileCommitInput,
  ): Promise<GitHubFileCommitResult> {
    const accessToken = await this.createInstallationAccessToken(
      installationId,
      input.repository.id,
    );
    let lastConflict: GitHubAppClientFailureError | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ref = await this.requestJson<GitHubRefResponse>(
        `/repos/${this.encodeRepository(input.repository)}/git/ref/heads/${this.encodeBranch(input.branch)}`,
        { authorization: `Bearer ${accessToken.token}` },
      );
      const headSha = ref.object?.sha;
      if (!headSha) throw new Error('GitHub returned an invalid branch ref');
      if (await this.pathExists(accessToken.token, input.repository, input.path, input.branch)) {
        throw new GitHubAppClientFailureError(
          { kind: 'conflict' },
          'Knowledge note path already exists',
        );
      }
      const commit = await this.requestJson<GitHubCommitResponse>(
        `/repos/${this.encodeRepository(input.repository)}/git/commits/${encodeURIComponent(headSha)}`,
        { authorization: `Bearer ${accessToken.token}` },
      );
      const treeSha = commit.tree?.sha;
      if (!treeSha) throw new Error('GitHub returned an invalid commit tree');
      const blob = await this.requestJson<{ sha?: string }>(
        `/repos/${this.encodeRepository(input.repository)}/git/blobs`,
        { authorization: `Bearer ${accessToken.token}` },
        'POST',
        { content: Buffer.from(input.content, 'utf8').toString('base64'), encoding: 'base64' },
      );
      if (!blob.sha) throw new Error('GitHub returned an invalid blob');
      const tree = await this.requestJson<{ sha?: string }>(
        `/repos/${this.encodeRepository(input.repository)}/git/trees`,
        { authorization: `Bearer ${accessToken.token}` },
        'POST',
        {
          base_tree: treeSha,
          tree: [{ path: input.path, mode: '100644', type: 'blob', sha: blob.sha }],
        },
      );
      if (!tree.sha) throw new Error('GitHub returned an invalid tree');
      const created = await this.requestJson<{ sha?: string }>(
        `/repos/${this.encodeRepository(input.repository)}/git/commits`,
        { authorization: `Bearer ${accessToken.token}` },
        'POST',
        {
          message: `${input.message}\n\nMemoFlow-Request-Id: ${input.requestId}`,
          tree: tree.sha,
          parents: [headSha],
        },
      );
      if (!created.sha) throw new Error('GitHub returned an invalid commit');
      try {
        await this.requestJson(
          `/repos/${this.encodeRepository(input.repository)}/git/refs/heads/${this.encodeBranch(input.branch)}`,
          { authorization: `Bearer ${accessToken.token}` },
          'PATCH',
          { sha: created.sha, force: false },
        );
      } catch (error) {
        if (error instanceof GitHubAppClientFailureError && error.failure.kind === 'conflict') {
          lastConflict = error;
          continue;
        }
        throw error;
      }
      return { commitSha: created.sha, blobSha: blob.sha };
    }
    throw (
      lastConflict ??
      new GitHubAppClientFailureError({ kind: 'conflict' }, 'GitHub branch changed during commit')
    );
  }

  async updateFileCommit(
    installationId: string,
    input: GitHubFileUpdateInput,
  ): Promise<GitHubFileCommitResult> {
    const accessToken = await this.createInstallationAccessToken(
      installationId,
      input.repository.id,
    );
    let lastConflict: GitHubAppClientFailureError | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const ref = await this.requestJson<GitHubRefResponse>(
        `/repos/${this.encodeRepository(input.repository)}/git/ref/heads/${this.encodeBranch(input.branch)}`,
        { authorization: `Bearer ${accessToken.token}` },
      );
      const headSha = ref.object?.sha;
      if (!headSha) throw new Error('GitHub returned an invalid branch ref');
      const currentBlobSha = await this.getPathBlobSha(
        accessToken.token,
        input.repository,
        input.path,
        headSha,
      );
      if (!currentBlobSha) {
        throw new GitHubAppClientFailureError(
          { kind: 'not_found' },
          'Knowledge note path no longer exists',
        );
      }
      if (currentBlobSha !== input.expectedBlobSha) {
        throw new GitHubAppClientFailureError(
          { kind: 'conflict' },
          'Knowledge note changed after adoption review',
        );
      }

      const commit = await this.requestJson<GitHubCommitResponse>(
        `/repos/${this.encodeRepository(input.repository)}/git/commits/${encodeURIComponent(headSha)}`,
        { authorization: `Bearer ${accessToken.token}` },
      );
      const treeSha = commit.tree?.sha;
      if (!treeSha) throw new Error('GitHub returned an invalid commit tree');
      const blob = await this.requestJson<{ sha?: string }>(
        `/repos/${this.encodeRepository(input.repository)}/git/blobs`,
        { authorization: `Bearer ${accessToken.token}` },
        'POST',
        { content: Buffer.from(input.content, 'utf8').toString('base64'), encoding: 'base64' },
      );
      if (!blob.sha) throw new Error('GitHub returned an invalid blob');
      const tree = await this.requestJson<{ sha?: string }>(
        `/repos/${this.encodeRepository(input.repository)}/git/trees`,
        { authorization: `Bearer ${accessToken.token}` },
        'POST',
        {
          base_tree: treeSha,
          tree: [{ path: input.path, mode: '100644', type: 'blob', sha: blob.sha }],
        },
      );
      if (!tree.sha) throw new Error('GitHub returned an invalid tree');
      const created = await this.requestJson<{ sha?: string }>(
        `/repos/${this.encodeRepository(input.repository)}/git/commits`,
        { authorization: `Bearer ${accessToken.token}` },
        'POST',
        {
          message: `${input.message}\n\nMemoFlow-Request-Id: ${input.requestId}`,
          tree: tree.sha,
          parents: [headSha],
        },
      );
      if (!created.sha) throw new Error('GitHub returned an invalid commit');
      try {
        await this.requestJson(
          `/repos/${this.encodeRepository(input.repository)}/git/refs/heads/${this.encodeBranch(input.branch)}`,
          { authorization: `Bearer ${accessToken.token}` },
          'PATCH',
          { sha: created.sha, force: false },
        );
      } catch (error) {
        if (error instanceof GitHubAppClientFailureError && error.failure.kind === 'conflict') {
          lastConflict = error;
          continue;
        }
        throw error;
      }
      return { commitSha: created.sha, blobSha: blob.sha };
    }
    throw (
      lastConflict ??
      new GitHubAppClientFailureError({ kind: 'conflict' }, 'GitHub branch changed during commit')
    );
  }

  private createAppJwt(): string {
    const nowSeconds = Math.floor(this.now() / 1000);
    const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({
      iat: nowSeconds - 60,
      exp: nowSeconds + 9 * 60,
      iss: this.options.appId,
    })}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const privateKey = this.options.privateKey.includes('\\n')
      ? this.options.privateKey.replace(/\\n/g, '\n')
      : this.options.privateKey;
    return `${unsigned}.${signer.sign(privateKey).toString('base64url')}`;
  }

  private async requestJson<T>(
    pathname: string,
    headers: Record<string, string>,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${pathname}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        'user-agent': 'memoflow-github-app',
        'x-github-api-version': '2022-11-28',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new GitHubAppClientFailureError(
        mapGitHubHttpStatusToFailure(response.status, response.headers.get('retry-after')),
        `GitHub API request failed (${response.status})`,
      );
    }
    return (await response.json()) as T;
  }

  private async getBlobContent(
    accessToken: string,
    repository: GitHubInstallationRepositoryDTO,
    blobSha: string,
  ): Promise<string> {
    const blob = await this.getBlobWithToken(
      accessToken,
      repository,
      blobSha,
      Number.MAX_SAFE_INTEGER,
    );
    return Buffer.from(blob.bytes).toString('utf8');
  }

  private async getBlobWithToken(
    accessToken: string,
    repository: GitHubInstallationRepositoryDTO,
    blobSha: string,
    maxBytes: number,
  ): Promise<GitHubBlobContent> {
    const blob = await this.requestJson<GitHubBlobResponse>(
      `/repos/${this.encodeRepository(repository)}/git/blobs/${encodeURIComponent(blobSha)}`,
      { authorization: `Bearer ${accessToken}` },
    );
    if (
      blob.encoding !== 'base64' ||
      typeof blob.content !== 'string' ||
      !Number.isSafeInteger(blob.size) ||
      blob.size! < 0 ||
      (blob.sha !== undefined && blob.sha !== blobSha)
    ) {
      throw new Error('GitHub returned an invalid blob response');
    }
    if (blob.size! > maxBytes) {
      throw new GitHubAppClientFailureError(
        { kind: 'payload_too_large' },
        'GitHub attachment exceeds the configured size limit',
      );
    }
    const bytes = Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
    if (bytes.byteLength !== blob.size) {
      throw new Error('GitHub returned a blob with inconsistent size metadata');
    }
    return { blobSha, byteSize: blob.size!, bytes };
  }

  private async pathExists(
    accessToken: string,
    repository: GitHubInstallationRepositoryDTO,
    relativePath: string,
    branch: string,
  ): Promise<boolean> {
    return (await this.getPathBlobSha(accessToken, repository, relativePath, branch)) !== null;
  }

  private async getPathBlobSha(
    accessToken: string,
    repository: GitHubInstallationRepositoryDTO,
    relativePath: string,
    ref: string,
  ): Promise<string | null> {
    const response = await this.fetchImpl(
      `${this.apiBaseUrl}/repos/${this.encodeRepository(repository)}/contents/${this.encodeRelativePath(relativePath)}?ref=${encodeURIComponent(ref)}`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${accessToken}`,
          'user-agent': 'memoflow-github-app',
          'x-github-api-version': '2022-11-28',
        },
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new GitHubAppClientFailureError(
        mapGitHubHttpStatusToFailure(response.status, response.headers.get('retry-after')),
        `GitHub API request failed (${response.status})`,
      );
    }
    const payload = (await response.json()) as GitHubContentsResponse;
    return payload.type === 'file' && typeof payload.sha === 'string' && payload.sha
      ? payload.sha
      : null;
  }

  private encodeRepository(repository: GitHubInstallationRepositoryDTO): string {
    const parts = repository.fullName.split('/');
    if (parts.length !== 2 || parts.some((part) => !part)) {
      throw new Error('GitHub repository full name is invalid');
    }
    return parts.map(encodeURIComponent).join('/');
  }

  private encodeBranch(branch: string): string {
    return branch.split('/').map(encodeURIComponent).join('/');
  }

  private encodeRelativePath(relativePath: string): string {
    return relativePath.split('/').map(encodeURIComponent).join('/');
  }

  private isMarkdownPath(relativePath: string): boolean {
    return relativePath.toLowerCase().endsWith('.md');
  }

  /**
   * Map installation-scoped repository payloads.
   *
   * GitHub often returns `permissions.{admin,push,pull}` as all `false` on
   * `/installation/repositories` for Apps that only request `contents` +
   * `metadata`. Actual write access is carried by the installation token
   * (`contents: write`), which we already verified before listing repos.
   * Derive push/pull from that installation grant so product gates match reality.
   */
  private toRepository(
    repository: GitHubRepositoryResponse,
    contentsPermission: 'read' | 'write' | 'none' = 'none',
  ): GitHubInstallationRepositoryDTO {
    if (!repository.id || !repository.full_name || !repository.owner?.id) {
      throw new Error('GitHub returned an invalid repository payload');
    }
    const reportedPush = repository.permissions?.push === true;
    const reportedPull = repository.permissions?.pull === true;
    const reportedAdmin = repository.permissions?.admin === true;
    const push = reportedPush || contentsPermission === 'write';
    const pull = reportedPull || contentsPermission === 'write' || contentsPermission === 'read';
    return {
      id: String(repository.id),
      nodeId: repository.node_id ?? '',
      fullName: repository.full_name,
      ownerId: String(repository.owner.id),
      private: repository.private === true,
      archived: repository.archived === true,
      disabled: repository.disabled === true,
      defaultBranch: repository.default_branch || 'main',
      permissions: {
        // Keep admin as GitHub reports it (Apps rarely get admin:true).
        admin: reportedAdmin,
        push,
        pull,
      },
    };
  }
}
