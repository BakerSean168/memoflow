import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { GitHubAppClient } from './github-app-client';

const NOW = Date.parse('2026-07-18T08:00:00.000Z');
const TOKEN_EXPIRY = '2026-07-18T08:05:00.000Z';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function getAuthorization(init: RequestInit | undefined): string {
  return new Headers(init?.headers).get('authorization') ?? '';
}

function verifyAppJwt(jwt: string) {
  const [encodedHeader, encodedPayload, encodedSignature] = jwt.split('.');
  expect(encodedHeader).toBeDefined();
  expect(encodedPayload).toBeDefined();
  expect(encodedSignature).toBeDefined();

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  return {
    header: JSON.parse(Buffer.from(encodedHeader!, 'base64url').toString('utf8')) as unknown,
    payload: JSON.parse(Buffer.from(encodedPayload!, 'base64url').toString('utf8')) as unknown,
    signatureValid: verifier.verify(publicKey, Buffer.from(encodedSignature!, 'base64url')),
  };
}

describe('GitHubAppClient', () => {
  it('signs a bounded RS256 app JWT and scopes installation tokens to one repository', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ token: 'repository-token', expires_at: TOKEN_EXPIRY }));
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(
      client.createInstallationAccessToken('installation-7', '987654321'),
    ).resolves.toEqual({
      token: 'repository-token',
      expiresAt: Date.parse(TOKEN_EXPIRY),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/app/installations/installation-7/access_tokens');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ repository_ids: [987654321] });

    const authorization = getAuthorization(init);
    expect(authorization).toMatch(/^Bearer /);
    const jwt = authorization.slice('Bearer '.length);
    const verified = verifyAppJwt(jwt);
    expect(verified.header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(verified.payload).toEqual({
      iat: Math.floor(NOW / 1000) - 60,
      exp: Math.floor(NOW / 1000) + 9 * 60,
      iss: 'github-app-123',
    });
    expect(verified.signatureValid).toBe(true);
  });

  it('uses an installation token only for inventory listing and maps verified repositories', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 7,
          account: { id: 42 },
          permissions: { contents: 'write' },
          suspended_at: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ token: 'inventory-token', expires_at: TOKEN_EXPIRY }))
      .mockResolvedValueOnce(
        jsonResponse({
          repositories: [
            {
              id: 987654321,
              node_id: 'R_knowledge',
              full_name: 'owner/knowledge',
              private: true,
              archived: false,
              disabled: false,
              default_branch: 'main',
              owner: { id: 42 },
              permissions: { admin: true, push: true, pull: true },
            },
          ],
        }),
      );
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(client.getInstallationInventory('7')).resolves.toEqual({
      installationId: '7',
      accountId: '42',
      contentsPermission: 'write',
      suspended: false,
      repositories: [
        {
          id: '987654321',
          nodeId: 'R_knowledge',
          fullName: 'owner/knowledge',
          ownerId: '42',
          private: true,
          archived: false,
          disabled: false,
          defaultBranch: 'main',
          permissions: { admin: true, push: true, pull: true },
        },
      ],
    });

    expect(getAuthorization(fetchImpl.mock.calls[0]?.[1])).toMatch(/^Bearer /);
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe('POST');
    expect(fetchImpl.mock.calls[1]?.[1]?.body).toBeUndefined();
    expect(getAuthorization(fetchImpl.mock.calls[2]?.[1])).toBe('Bearer inventory-token');
  });

  it('derives push/pull from installation contents:write when GitHub reports all-false repo permissions', async () => {
    // Real App installs often return admin/push/pull all false on
    // /installation/repositories while the token still has contents:write.
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 7,
          account: { id: 42 },
          permissions: { contents: 'write' },
          suspended_at: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ token: 'inventory-token', expires_at: TOKEN_EXPIRY }))
      .mockResolvedValueOnce(
        jsonResponse({
          repositories: [
            {
              id: 987654321,
              node_id: 'R_knowledge',
              full_name: 'owner/knowledge',
              private: true,
              archived: false,
              disabled: false,
              default_branch: 'main',
              owner: { id: 42 },
              permissions: {
                admin: false,
                maintain: false,
                push: false,
                triage: false,
                pull: false,
              },
            },
          ],
        }),
      );
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    const inventory = await client.getInstallationInventory('7');
    expect(inventory.contentsPermission).toBe('write');
    expect(inventory.repositories[0]?.permissions).toEqual({
      admin: false,
      push: true,
      pull: true,
    });
  });

  it.each([
    ['suspended', 'write', '2026-07-18T08:00:00.000Z'],
    ['read-only', 'read', null],
  ])(
    'returns %s installation diagnostics without requesting an installation token',
    async (_label, contents, suspendedAt) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          id: 7,
          account: { id: 42 },
          permissions: { contents },
          suspended_at: suspendedAt,
        }),
      );
      const client = new GitHubAppClient({
        appId: 'github-app-123',
        privateKey,
        fetchImpl,
        now: () => NOW,
      });

      await expect(client.getInstallationInventory('7')).resolves.toMatchObject({
        contentsPermission: contents,
        suspended: Boolean(suspendedAt),
        repositories: [],
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  it.each(['not-a-number', '0', '-1', '9007199254740992'])(
    'rejects an unsafe repository id before requesting a token: %s',
    async (repositoryId) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const client = new GitHubAppClient({
        appId: 'github-app-123',
        privateKey,
        fetchImpl,
        now: () => NOW,
      });

      await expect(
        client.createInstallationAccessToken('installation-7', repositoryId),
      ).rejects.toThrow('positive integer');
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('rejects expired or malformed GitHub installation tokens', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ token: 'expired-token', expires_at: '2026-07-18T07:59:59.000Z' }),
      );
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(client.createInstallationAccessToken('installation-7', '1')).rejects.toThrow(
      'invalid installation token response',
    );
  });

  it('maps GitHub not-found status to a provider-neutral lifecycle failure', async () => {
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ message: 'Not Found' }, 404)),
      now: () => NOW,
    });

    await expect(client.getInstallationInventory('removed-installation')).rejects.toMatchObject({
      name: 'GitHubAppClientFailureError',
      failure: { kind: 'not_found' },
      message: 'GitHub API request failed (404)',
    });
  });

  it('reads a repository-scoped GraphQL snapshot and treats scaffold-only trees as empty', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: 'repository-token', expires_at: TOKEN_EXPIRY }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            node: {
              id: 'R_knowledge',
              isEmpty: false,
              defaultBranchRef: {
                name: 'main',
                target: {
                  oid: 'scaffold-head-sha',
                  tree: {
                    entries: [
                      { name: 'README.md', type: 'blob' },
                      { name: '.gitignore', type: 'blob' },
                      { name: '.memory-flow', type: 'tree' },
                    ],
                  },
                },
              },
            },
          },
        }),
      );
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(
      client.getRepositorySnapshot('installation-7', {
        id: '987654321',
        nodeId: 'R_knowledge',
        fullName: 'owner/knowledge',
        ownerId: '42',
        private: true,
        archived: false,
        disabled: false,
        defaultBranch: 'main',
        permissions: { admin: true, push: true, pull: true },
      }),
    ).resolves.toEqual({
      repositoryId: '987654321',
      defaultBranch: 'main',
      empty: true,
      headSha: 'scaffold-head-sha',
    });

    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      repository_ids: [987654321],
    });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://api.github.com/graphql');
    expect(getAuthorization(fetchImpl.mock.calls[1]?.[1])).toBe('Bearer repository-token');
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toMatchObject({
      variables: { repositoryId: 'R_knowledge' },
    });
  });

  it('detects knowledge content in the default branch snapshot', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: 'repository-token', expires_at: TOKEN_EXPIRY }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            node: {
              id: 'R_knowledge',
              isEmpty: false,
              defaultBranchRef: {
                name: 'trunk',
                target: {
                  oid: 'knowledge-head-sha',
                  tree: { entries: [{ name: 'Notes', type: 'tree' }] },
                },
              },
            },
          },
        }),
      );
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(
      client.getRepositorySnapshot('installation-7', {
        id: '987654321',
        nodeId: 'R_knowledge',
        fullName: 'owner/knowledge',
        ownerId: '42',
        private: true,
        archived: false,
        disabled: false,
        defaultBranch: 'main',
        permissions: { admin: true, push: true, pull: true },
      }),
    ).resolves.toMatchObject({
      empty: false,
      defaultBranch: 'trunk',
      headSha: 'knowledge-head-sha',
    });
  });

  it('rebuilds Markdown content and attachment metadata without downloading attachment blobs', async () => {
    const markdown = '# Note';
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: 'repository-token', expires_at: TOKEN_EXPIRY }))
      .mockResolvedValueOnce(
        jsonResponse({
          truncated: false,
          tree: [
            { path: 'notes/Note.md', type: 'blob', sha: 'note-blob', size: markdown.length },
            { path: 'assets/diagram.png', type: 'blob', sha: 'image-blob', size: 4 },
            { path: 'assets/active.svg', type: 'blob', sha: 'svg-blob', size: 20 },
            { path: '.obsidian/icon.png', type: 'blob', sha: 'control-blob', size: 4 },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          sha: 'note-blob',
          size: Buffer.byteLength(markdown),
          encoding: 'base64',
          content: Buffer.from(markdown).toString('base64'),
        }),
      );
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(
      client.getFullMarkdownSnapshot(
        'installation-7',
        {
          id: '987654321',
          nodeId: 'R_knowledge',
          fullName: 'owner/knowledge',
          ownerId: '42',
          private: true,
          archived: false,
          disabled: false,
          defaultBranch: 'main',
          permissions: { admin: true, push: true, pull: true },
        },
        'commit-sha',
      ),
    ).resolves.toEqual({
      commitSha: 'commit-sha',
      files: [
        {
          relativePath: 'notes/Note.md',
          blobSha: 'note-blob',
          markdownContent: markdown,
        },
      ],
      attachments: [
        {
          relativePath: 'assets/diagram.png',
          blobSha: 'image-blob',
          byteSize: 4,
          mediaType: 'image/png',
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('returns attachment changes without fetching their bytes during compare ingestion', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: 'repository-token', expires_at: TOKEN_EXPIRY }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'ahead',
          files: [
            {
              filename: 'assets/diagram.png',
              previous_filename: 'assets/old.png',
              status: 'renamed',
              sha: 'image-blob',
            },
          ],
        }),
      );
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(
      client.getMarkdownChanges(
        'installation-7',
        {
          id: '987654321',
          nodeId: 'R_knowledge',
          fullName: 'owner/knowledge',
          ownerId: '42',
          private: true,
          archived: false,
          disabled: false,
          defaultBranch: 'main',
          permissions: { admin: true, push: true, pull: true },
        },
        'before-sha',
        'after-sha',
      ),
    ).resolves.toEqual({
      commitSha: 'after-sha',
      changes: [],
      attachmentChanges: [
        {
          relativePath: 'assets/diagram.png',
          previousPath: 'assets/old.png',
          blobSha: 'image-blob',
          byteSize: null,
          mediaType: 'image/png',
          status: 'renamed',
        },
      ],
      requiresFullSnapshot: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('enforces the attachment byte limit before decoding GitHub blob content', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: 'repository-token', expires_at: TOKEN_EXPIRY }))
      .mockResolvedValueOnce(
        jsonResponse({
          sha: 'large-blob',
          size: 10 * 1024 * 1024 + 1,
          encoding: 'base64',
          content: '',
        }),
      );
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(
      client.getBlob(
        'installation-7',
        {
          id: '987654321',
          nodeId: 'R_knowledge',
          fullName: 'owner/knowledge',
          ownerId: '42',
          private: true,
          archived: false,
          disabled: false,
          defaultBranch: 'main',
          permissions: { admin: true, push: true, pull: true },
        },
        'large-blob',
        10 * 1024 * 1024,
      ),
    ).rejects.toMatchObject({ failure: { kind: 'payload_too_large' } });
  });

  it('updates an existing Markdown file only when its reviewed blob is unchanged', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: 'repository-token', expires_at: TOKEN_EXPIRY }))
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'head-sha' } }))
      .mockResolvedValueOnce(jsonResponse({ type: 'file', sha: 'reviewed-blob' }))
      .mockResolvedValueOnce(jsonResponse({ tree: { sha: 'base-tree' } }))
      .mockResolvedValueOnce(jsonResponse({ sha: 'new-blob' }))
      .mockResolvedValueOnce(jsonResponse({ sha: 'new-tree' }))
      .mockResolvedValueOnce(jsonResponse({ sha: 'new-commit' }))
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'new-commit' } }));
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });
    const repository = {
      id: '987654321',
      nodeId: 'R_knowledge',
      fullName: 'owner/knowledge',
      ownerId: '42',
      private: true,
      archived: false,
      disabled: false,
      defaultBranch: 'main',
      permissions: { admin: true, push: true, pull: true },
    };

    await expect(
      client.updateFileCommit('installation-7', {
        repository,
        path: 'notes/existing.md',
        branch: 'main',
        expectedBlobSha: 'reviewed-blob',
        content: '---\nmemoflow_id: kdoc_550e8400-e29b-41d4-a716-446655440490\n---\n# Existing',
        message: 'Adopt knowledge note: Existing',
        requestId: 'adopt-request-1',
      }),
    ).resolves.toEqual({ commitSha: 'new-commit', blobSha: 'new-blob' });

    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('/git/ref/heads/main');
    expect(String(fetchImpl.mock.calls[2]?.[0])).toContain(
      '/contents/notes/existing.md?ref=head-sha',
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[4]?.[1]?.body))).toEqual({
      content: Buffer.from(
        '---\nmemoflow_id: kdoc_550e8400-e29b-41d4-a716-446655440490\n---\n# Existing',
        'utf8',
      ).toString('base64'),
      encoding: 'base64',
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[7]?.[1]?.body))).toEqual({
      sha: 'new-commit',
      force: false,
    });
  });

  it('refuses adoption before creating Git objects when the reviewed blob changed', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ token: 'repository-token', expires_at: TOKEN_EXPIRY }))
      .mockResolvedValueOnce(jsonResponse({ object: { sha: 'head-sha' } }))
      .mockResolvedValueOnce(jsonResponse({ type: 'file', sha: 'changed-blob' }));
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(
      client.updateFileCommit('installation-7', {
        repository: {
          id: '987654321',
          nodeId: 'R_knowledge',
          fullName: 'owner/knowledge',
          ownerId: '42',
          private: true,
          archived: false,
          disabled: false,
          defaultBranch: 'main',
          permissions: { admin: true, push: true, pull: true },
        },
        path: 'notes/existing.md',
        branch: 'main',
        expectedBlobSha: 'reviewed-blob',
        content: '# Existing',
        message: 'Adopt knowledge note: Existing',
        requestId: 'adopt-request-1',
      }),
    ).rejects.toMatchObject({ failure: { kind: 'conflict' } });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('/git/ref/heads/main');
    expect(String(fetchImpl.mock.calls[2]?.[0])).toContain(
      '/contents/notes/existing.md?ref=head-sha',
    );
  });

  it('rejects a mutable-branch review when the frozen head has a changed blob', async () => {
    const requests: Array<{ method: string; url: string }> = [];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ method, url });

      if (url.endsWith('/app/installations/installation-7/access_tokens')) {
        return jsonResponse({ token: 'repository-token', expires_at: TOKEN_EXPIRY });
      }
      if (url.endsWith('/git/ref/heads/main')) {
        return jsonResponse({ object: { sha: 'head-b' } });
      }
      if (url.endsWith('/contents/notes/existing.md?ref=main')) {
        return jsonResponse({ type: 'file', sha: 'reviewed-blob' });
      }
      if (url.endsWith('/contents/notes/existing.md?ref=head-b')) {
        return jsonResponse({ type: 'file', sha: 'changed-blob' });
      }
      if (url.endsWith('/git/commits/head-b')) {
        return jsonResponse({ tree: { sha: 'base-tree' } });
      }
      if (url.endsWith('/git/blobs')) return jsonResponse({ sha: 'new-blob' });
      if (url.endsWith('/git/trees')) return jsonResponse({ sha: 'new-tree' });
      if (url.endsWith('/git/commits')) return jsonResponse({ sha: 'new-commit' });
      if (url.endsWith('/git/refs/heads/main')) {
        return jsonResponse({ object: { sha: 'new-commit' } });
      }
      throw new Error(`Unexpected GitHub request: ${method} ${url}`);
    });
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(
      client.updateFileCommit('installation-7', {
        repository: {
          id: '987654321',
          nodeId: 'R_knowledge',
          fullName: 'owner/knowledge',
          ownerId: '42',
          private: true,
          archived: false,
          disabled: false,
          defaultBranch: 'main',
          permissions: { admin: true, push: true, pull: true },
        },
        path: 'notes/existing.md',
        branch: 'main',
        expectedBlobSha: 'reviewed-blob',
        content: '# Existing',
        message: 'Adopt knowledge note: Existing',
        requestId: 'adopt-request-1',
      }),
    ).rejects.toMatchObject({ failure: { kind: 'conflict' } });

    expect(requests).toEqual([
      {
        method: 'POST',
        url: 'https://api.github.com/app/installations/installation-7/access_tokens',
      },
      {
        method: 'GET',
        url: 'https://api.github.com/repos/owner/knowledge/git/ref/heads/main',
      },
      {
        method: 'GET',
        url: 'https://api.github.com/repos/owner/knowledge/contents/notes/existing.md?ref=head-b',
      },
    ]);
  });

  it('revalidates the frozen head and path before creating objects after a ref race', async () => {
    const requests: Array<{ method: string; url: string }> = [];
    let branchRefReads = 0;
    let branchUpdates = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ method, url });

      if (url.endsWith('/app/installations/installation-7/access_tokens')) {
        return jsonResponse({ token: 'repository-token', expires_at: TOKEN_EXPIRY });
      }
      if (url.endsWith('/git/ref/heads/main')) {
        branchRefReads += 1;
        return jsonResponse({ object: { sha: branchRefReads === 1 ? 'head-a' : 'head-b' } });
      }
      if (url.includes('/contents/notes/existing.md?ref=')) {
        const ref = new URL(url).searchParams.get('ref');
        expect(ref).toBe(branchRefReads === 1 ? 'head-a' : 'head-b');
        return jsonResponse({ type: 'file', sha: 'reviewed-blob' });
      }
      if (url.endsWith('/git/commits/head-a')) {
        return jsonResponse({ tree: { sha: 'base-tree-a' } });
      }
      if (url.endsWith('/git/commits/head-b')) {
        return jsonResponse({ tree: { sha: 'base-tree-b' } });
      }
      if (url.endsWith('/git/blobs')) {
        return jsonResponse({ sha: branchRefReads === 1 ? 'new-blob-a' : 'new-blob-b' });
      }
      if (url.endsWith('/git/trees')) {
        return jsonResponse({ sha: branchRefReads === 1 ? 'new-tree-a' : 'new-tree-b' });
      }
      if (url.endsWith('/git/commits')) {
        return jsonResponse({ sha: branchRefReads === 1 ? 'new-commit-a' : 'new-commit-b' });
      }
      if (url.endsWith('/git/refs/heads/main')) {
        branchUpdates += 1;
        return branchUpdates === 1
          ? jsonResponse({ message: 'branch advanced' }, 409)
          : jsonResponse({ object: { sha: 'new-commit-b' } });
      }
      throw new Error(`Unexpected GitHub request: ${method} ${url}`);
    });
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(
      client.updateFileCommit('installation-7', {
        repository: {
          id: '987654321',
          nodeId: 'R_knowledge',
          fullName: 'owner/knowledge',
          ownerId: '42',
          private: true,
          archived: false,
          disabled: false,
          defaultBranch: 'main',
          permissions: { admin: true, push: true, pull: true },
        },
        path: 'notes/existing.md',
        branch: 'main',
        expectedBlobSha: 'reviewed-blob',
        content: '# Existing',
        message: 'Adopt knowledge note: Existing',
        requestId: 'adopt-request-1',
      }),
    ).resolves.toEqual({ commitSha: 'new-commit-b', blobSha: 'new-blob-b' });

    expect(requests).toEqual([
      {
        method: 'POST',
        url: 'https://api.github.com/app/installations/installation-7/access_tokens',
      },
      {
        method: 'GET',
        url: 'https://api.github.com/repos/owner/knowledge/git/ref/heads/main',
      },
      {
        method: 'GET',
        url: 'https://api.github.com/repos/owner/knowledge/contents/notes/existing.md?ref=head-a',
      },
      {
        method: 'GET',
        url: 'https://api.github.com/repos/owner/knowledge/git/commits/head-a',
      },
      { method: 'POST', url: 'https://api.github.com/repos/owner/knowledge/git/blobs' },
      { method: 'POST', url: 'https://api.github.com/repos/owner/knowledge/git/trees' },
      { method: 'POST', url: 'https://api.github.com/repos/owner/knowledge/git/commits' },
      {
        method: 'PATCH',
        url: 'https://api.github.com/repos/owner/knowledge/git/refs/heads/main',
      },
      {
        method: 'GET',
        url: 'https://api.github.com/repos/owner/knowledge/git/ref/heads/main',
      },
      {
        method: 'GET',
        url: 'https://api.github.com/repos/owner/knowledge/contents/notes/existing.md?ref=head-b',
      },
      {
        method: 'GET',
        url: 'https://api.github.com/repos/owner/knowledge/git/commits/head-b',
      },
      { method: 'POST', url: 'https://api.github.com/repos/owner/knowledge/git/blobs' },
      { method: 'POST', url: 'https://api.github.com/repos/owner/knowledge/git/trees' },
      { method: 'POST', url: 'https://api.github.com/repos/owner/knowledge/git/commits' },
      {
        method: 'PATCH',
        url: 'https://api.github.com/repos/owner/knowledge/git/refs/heads/main',
      },
    ]);
  });
});
