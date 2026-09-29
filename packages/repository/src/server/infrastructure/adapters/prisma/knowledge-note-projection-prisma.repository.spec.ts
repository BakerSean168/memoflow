import { describe, expect, it, vi } from 'vitest';
import { KnowledgeNoteProjectionPrismaRepository } from './knowledge-note-projection-prisma.repository';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'projection-1',
    bindingId: 'binding-1',
    knowledgeDocumentId: null,
    relativePath: 'z/password-manager.md',
    commitSha: 'a'.repeat(40),
    blobSha: 'b'.repeat(40),
    contentHash: 'c'.repeat(64),
    frontmatter: { title: 'Password Manager' },
    markdownContent: 'A general password manager note.',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('KnowledgeNoteProjectionPrismaRepository catalog/search', () => {
  it('returns lightweight ranked search summaries with total + search cursor', async () => {
    const findMany = vi.fn(async () => [
      row({
        id: 'body',
        relativePath: 'z/security.md',
        frontmatter: { title: 'Security notes' },
        updatedAt: new Date('2026-09-01T00:00:00Z'),
      }),
      row({
        id: 'exact',
        relativePath: 'z/1password.md',
        frontmatter: { title: '1Password' },
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ]);
    const repository = new KnowledgeNoteProjectionPrismaRepository({
      knowledgeNoteProjection: { findMany },
    } as never);

    const page = await repository.listByIdentity('identity-1', {
      connectionId: 'binding-1',
      query: '1Password password',
      limit: 1,
    });

    expect(findMany).toHaveBeenCalledOnce();
    const request = findMany.mock.calls[0]?.[0] as {
      where: { AND?: Array<{ OR: unknown[] }> };
      select: Record<string, boolean>;
    };
    expect(request.where.AND).toHaveLength(2);
    expect(request.where.AND?.every((term) => term.OR.length === 2)).toBe(true);
    expect(request.select.markdownContent).toBe(true);
    expect(page.total).toBe(2);
    expect(page.notes).toEqual([
      expect.objectContaining({
        id: 'exact',
        title: '1Password',
        relativePath: 'z/1password.md',
      }),
    ]);
    expect(page.notes[0]).not.toHaveProperty('markdownContent');
    expect(page.nextCursor).toMatch(/^q~\d+~\d+~exact$/);

    const second = await repository.listByIdentity('identity-1', {
      connectionId: 'binding-1',
      query: '1Password password',
      cursor: page.nextCursor ?? undefined,
      limit: 1,
    });
    expect(second.notes[0]?.id).toBe('body');
    expect(second.nextCursor).toBeNull();
  });

  it('applies the exact hidden-directory policy to search unless explicitly overridden', async () => {
    const visible = row({
      id: 'visible',
      relativePath: 'z/password-manager.md',
    });
    const hidden = row({
      id: 'hidden',
      relativePath: '.github/password-manager.md',
    });
    const findMany = vi.fn(async () => [visible, hidden]);
    const repository = new KnowledgeNoteProjectionPrismaRepository({
      knowledgeNoteProjection: { findMany },
    } as never);

    const defaultSearch = await repository.listByIdentity('identity-1', {
      connectionId: 'binding-1',
      query: 'password',
      limit: 20,
    });
    expect(defaultSearch.notes.map((note) => note.id)).toEqual(['visible']);
    expect(defaultSearch.total).toBe(1);

    const searchRequest = findMany.mock.calls[0]?.[0] as {
      where: { NOT?: unknown };
    };
    expect(searchRequest.where.NOT).toBeUndefined();

    const includingHidden = await repository.listByIdentity('identity-1', {
      connectionId: 'binding-1',
      query: 'password',
      includeHidden: true,
      limit: 20,
    });
    expect(includingHidden.notes.map((note) => note.id)).toEqual(
      expect.arrayContaining(['visible', 'hidden']),
    );
    expect(includingHidden.total).toBe(2);
  });

  it('builds a lazy folder-first tree and hides default implementation directories', async () => {
    const rows = [
      row({
        id: 'root-note',
        relativePath: 'AGENTS.md',
        frontmatter: { title: 'AGENTS' },
      }),
      row({
        id: 'asset-a',
        relativePath: 'assets/hosts/a.md',
        frontmatter: { title: 'A host' },
      }),
      row({
        id: 'asset-b',
        relativePath: 'assets/hosts/b.md',
        frontmatter: { title: 'B host' },
      }),
      row({
        id: 'z-note',
        relativePath: 'z/tdd.md',
        frontmatter: { title: 'TDD' },
      }),
      row({
        id: 'dot-directory-note',
        relativePath: '.github/readme.md',
        frontmatter: { title: 'Hidden GitHub note' },
      }),
      row({
        id: 'node-module-note',
        relativePath: 'node_modules/pkg/readme.md',
        frontmatter: { title: 'Package readme' },
      }),
      row({
        id: 'generated-note',
        relativePath: 'generated/index.md',
        frontmatter: { title: 'Generated' },
      }),
    ];
    const findMany = vi.fn(
      async (request: { where?: { relativePath?: { startsWith?: string } } }) => {
        const prefix = request.where?.relativePath?.startsWith;
        return prefix ? rows.filter((item) => item.relativePath.startsWith(prefix)) : rows;
      },
    );
    const repository = new KnowledgeNoteProjectionPrismaRepository({
      knowledgeNoteProjection: { findMany },
    } as never);

    const root = await repository.listTreeByIdentity('identity-1', {
      connectionId: 'binding-1',
      parent: '',
      includeHidden: false,
    });

    expect(root.metadata).toEqual({
      total: 7,
      visibleTotal: 4,
      hiddenNoteCount: 3,
      hiddenDirectories: ['.github', 'generated', 'node_modules'],
    });
    expect(root.nodes).toEqual([
      {
        kind: 'directory',
        name: 'assets',
        relativePath: 'assets',
        noteCount: 2,
        hasChildren: true,
      },
      {
        kind: 'directory',
        name: 'z',
        relativePath: 'z',
        noteCount: 1,
        hasChildren: true,
      },
      expect.objectContaining({
        kind: 'note',
        title: 'AGENTS',
        relativePath: 'AGENTS.md',
        projectionId: 'root-note',
      }),
    ]);

    const assets = await repository.listTreeByIdentity('identity-1', {
      connectionId: 'binding-1',
      parent: 'assets',
      includeHidden: false,
    });
    expect(assets.metadata).toBeNull();
    expect(assets.nodes).toEqual([
      {
        kind: 'directory',
        name: 'hosts',
        relativePath: 'assets/hosts',
        noteCount: 2,
        hasChildren: true,
      },
    ]);

    const withHidden = await repository.listTreeByIdentity('identity-1', {
      connectionId: 'binding-1',
      parent: '',
      includeHidden: true,
    });
    expect(withHidden.metadata).toMatchObject({
      total: 7,
      visibleTotal: 7,
      hiddenNoteCount: 3,
    });
    const visiblePaths = withHidden.nodes.map((item) => item.relativePath);
    expect(visiblePaths).toEqual(
      expect.arrayContaining(['.github', 'assets', 'generated', 'node_modules', 'z', 'AGENTS.md']),
    );
  });

  it('resolves projection id, stable document id, or relative path inside the identity boundary', async () => {
    const findFirst = vi.fn(async () =>
      row({
        id: 'projection-resolved',
        knowledgeDocumentId: 'kdoc_11111111-1111-4111-8111-111111111111',
        relativePath: 'z/resolved.md',
      }),
    );
    const repository = new KnowledgeNoteProjectionPrismaRepository({
      knowledgeNoteProjection: { findFirst },
    } as never);

    const resolved = await repository.resolveReferenceForIdentity('identity-1', {
      connectionId: 'binding-1',
      reference: 'z\\resolved.md',
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        binding: { identityId: 'identity-1', disconnectedAt: null },
        bindingId: 'binding-1',
        deletedAt: null,
        OR: [
          { id: 'z/resolved.md' },
          { knowledgeDocumentId: 'z/resolved.md' },
          { relativePath: 'z/resolved.md' },
        ],
      },
    });
    expect(resolved).toEqual(
      expect.objectContaining({
        id: 'projection-resolved',
        relativePath: 'z/resolved.md',
      }),
    );
  });

  it('lists durable knowledge documents before pagination and includes their knowledge space', async () => {
    const newestStable = {
      ...row({
        id: 'stable-new',
        knowledgeDocumentId: 'kdoc_11111111-1111-4111-8111-111111111111',
        relativePath: 'z/1password.md',
        updatedAt: new Date('2026-09-28T06:09:46.518Z'),
      }),
      binding: { knowledgeSpaceId: 'KnowledgeSpaceId_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    };
    const olderStable = {
      ...row({
        id: 'stable-old',
        knowledgeDocumentId: 'kdoc_22222222-2222-4222-8222-222222222222',
        relativePath: 'z/zustand.md',
        updatedAt: new Date('2026-09-27T06:09:46.518Z'),
      }),
      binding: { knowledgeSpaceId: 'KnowledgeSpaceId_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    };
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([newestStable, olderStable])
      .mockResolvedValueOnce([olderStable]);
    const count = vi.fn(async () => 2);
    const repository = new KnowledgeNoteProjectionPrismaRepository({
      knowledgeNoteProjection: { findMany, count },
    } as never);

    const page = await repository.listReferenceableByIdentity('identity-1', { limit: 1 });

    expect(page.total).toBe(2);
    expect(page.documents[0]).toMatchObject({
      projectionId: 'stable-new',
      documentId: 'kdoc_11111111-1111-4111-8111-111111111111',
      knowledgeSpaceId: 'KnowledgeSpaceId_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Password Manager',
      relativePath: 'z/1password.md',
    });
    expect(page.nextCursor).toMatch(/^r~\d+~stable-new$/);

    const firstRequest = findMany.mock.calls[0]?.[0] as {
      where: { knowledgeDocumentId?: { not?: null } };
      orderBy: unknown;
      take: number;
      select: { binding?: unknown };
    };
    expect(firstRequest.where.knowledgeDocumentId).toEqual({ not: null });
    expect(firstRequest.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'desc' }]);
    expect(firstRequest.take).toBe(2);
    expect(firstRequest.select.binding).toBeTruthy();

    const secondPage = await repository.listReferenceableByIdentity('identity-1', {
      cursor: page.nextCursor ?? undefined,
      limit: 1,
    });
    expect(secondPage.documents[0]?.projectionId).toBe('stable-old');
    const secondRequest = findMany.mock.calls[1]?.[0] as {
      where: { OR?: unknown[]; knowledgeDocumentId?: { not?: null } };
    };
    expect(secondRequest.where.knowledgeDocumentId).toEqual({ not: null });
    expect(secondRequest.where.OR).toHaveLength(2);
  });

  it('uses keyset pagination for the normal catalog and returns the real total', async () => {
    const first = row({
      id: 'projection-b',
      relativePath: 'a/first.md',
      updatedAt: new Date('2026-09-28T01:00:00Z'),
    });
    const second = row({
      id: 'projection-a',
      relativePath: 'b/second.md',
      updatedAt: new Date('2026-09-27T01:00:00Z'),
    });
    const findMany = vi.fn().mockResolvedValueOnce([first, second]).mockResolvedValueOnce([second]);
    const count = vi.fn(async () => 3648);
    const repository = new KnowledgeNoteProjectionPrismaRepository({
      knowledgeNoteProjection: { findMany, count },
    } as never);

    const page = await repository.listByIdentity('identity-1', {
      connectionId: 'binding-1',
      limit: 1,
    });

    expect(page.total).toBe(3648);
    expect(page.notes).toHaveLength(1);
    expect(page.notes[0]?.id).toBe('projection-b');
    expect(page.nextCursor).toMatch(/^b~[A-Za-z0-9_-]+~projection-b$/);

    const firstRequest = findMany.mock.calls[0]?.[0] as {
      orderBy: unknown;
      take: number;
      select: Record<string, boolean>;
    };
    expect(firstRequest.orderBy).toEqual([{ relativePath: 'asc' }, { id: 'asc' }]);
    expect(firstRequest.take).toBe(2);
    expect(firstRequest.select.markdownContent).toBeUndefined();

    const secondPage = await repository.listByIdentity('identity-1', {
      connectionId: 'binding-1',
      cursor: page.nextCursor ?? undefined,
      limit: 1,
    });
    expect(secondPage.notes[0]?.id).toBe('projection-a');
    expect(secondPage.nextCursor).toBeNull();

    const secondRequest = findMany.mock.calls[1]?.[0] as {
      where: { OR?: unknown[] };
    };
    expect(secondRequest.where.OR).toHaveLength(2);
  });
});
