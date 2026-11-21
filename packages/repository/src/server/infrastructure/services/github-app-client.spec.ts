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
  it('discovers an existing App installation for the verified GitHub account', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse([
        { id: 7, account: { id: 41 }, permissions: { contents: 'write' }, suspended_at: null },
        { id: 8, account: { id: 42 }, permissions: { contents: 'write' }, suspended_at: null },
      ]),
    );
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(client.findInstallationForAccount('42')).resolves.toEqual({
      installationId: '8',
      accountId: '42',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://api.github.com/app/installations?per_page=100&page=1',
    );
    expect(getAuthorization(fetchImpl.mock.calls[0]?.[1])).toMatch(/^Bearer /);
  });

  it('returns null when the App is not installed for that GitHub account', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse([
          { id: 7, account: { id: 41 }, permissions: { contents: 'write' }, suspended_at: null },
        ]),
      );
    const client = new GitHubAppClient({
      appId: 'github-app-123',
      privateKey,
      fetchImpl,
      now: () => NOW,
    });

    await expect(client.findInstallationForAccount('42')).resolves.toBeNull();
  });

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
    expect(JSON.parse(String(init?.body))).toEqual({
      repository_ids: [987654321],
      permissions: { contents: 'read', metadata: 'read' },
    });

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
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({
      permissions: { contents: 'read', metadata: 'read' },
    });
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
    ['unreadable', 'none', null],
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
      permissions: { contents: 'read', metadata: 'read' },
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
});
