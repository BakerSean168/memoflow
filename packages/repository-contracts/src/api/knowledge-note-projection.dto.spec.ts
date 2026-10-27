import { describe, expect, it } from 'vitest';
import {
  KnowledgeNoteProjectionListResponseSchema,
  KnowledgeNoteTreeResponseSchema,
  ListReferenceableKnowledgeDocumentsSchema,
  ReferenceableKnowledgeDocumentListResponseSchema,
  ListKnowledgeNoteProjectionsSchema,
  ListKnowledgeProjectionsSchema,
  ListKnowledgeNoteTreeSchema,
  ResolveKnowledgeNoteReferenceSchema,
} from './knowledge-note-projection.dto';

describe('knowledge note projection catalog contracts', () => {
  it('keeps the list response lightweight even when a caller supplies detail-only fields', () => {
    const parsed = KnowledgeNoteProjectionListResponseSchema.parse({
      notes: [
        {
          id: 'knowledge-note-1',
          connectionId: 'connection-1',
          knowledgeDocumentId: null,
          relativePath: 'z/1password.md',
          title: '1Password',
          contentHash: 'a'.repeat(64),
          updatedAt: 1,
          markdownContent: '# should be stripped',
          frontmatter: { title: 'should be stripped' },
          commitSha: 'commit',
          blobSha: 'blob',
        },
      ],
      total: 3648,
      nextCursor: 'b~ei8xcGFzc3dvcmQubWQ~knowledge-note-1',
    });

    expect(parsed.total).toBe(3648);
    expect(parsed.notes[0]).toEqual({
      id: 'knowledge-note-1',
      connectionId: 'connection-1',
      knowledgeDocumentId: null,
      relativePath: 'z/1password.md',
      title: '1Password',
      contentHash: 'a'.repeat(64),
      updatedAt: 1,
    });
    expect(parsed.notes[0]).not.toHaveProperty('markdownContent');
    expect(parsed.notes[0]).not.toHaveProperty('frontmatter');
  });

  it('validates repository-relative tree parents and hidden-directory flags', () => {
    expect(
      ListKnowledgeNoteTreeSchema.parse({
        connectionId: 'connection-1',
        parent: 'assets/hosts/',
        includeHidden: 'true',
      }),
    ).toEqual({
      connectionId: 'connection-1',
      parent: 'assets/hosts',
      includeHidden: true,
    });

    expect(
      ListKnowledgeNoteTreeSchema.safeParse({
        parent: '../private',
        includeHidden: false,
      }).success,
    ).toBe(false);

    const response = KnowledgeNoteTreeResponseSchema.parse({
      parent: '',
      nodes: [
        {
          kind: 'directory',
          name: 'assets',
          relativePath: 'assets',
          noteCount: 92,
          hasChildren: true,
        },
        {
          kind: 'note',
          name: 'AGENTS',
          title: 'AGENTS',
          relativePath: 'AGENTS.md',
          projectionId: 'projection-1',
          knowledgeDocumentId: null,
          contentHash: 'a'.repeat(64),
          updatedAt: 1,
        },
      ],
      metadata: {
        total: 3648,
        visibleTotal: 3477,
        hiddenNoteCount: 171,
        hiddenDirectories: ['.*', 'node_modules', 'generated'],
      },
    });
    expect(response.nodes.map((node) => node.kind)).toEqual(['directory', 'note']);
    expect(response.metadata?.hiddenNoteCount).toBe(171);
  });

  it('accepts bounded note references for deep-link resolution', () => {
    expect(
      ResolveKnowledgeNoteReferenceSchema.parse({
        connectionId: 'connection-1',
        reference: ' kdoc_11111111-1111-4111-8111-111111111111 ',
      }),
    ).toEqual({
      connectionId: 'connection-1',
      reference: 'kdoc_11111111-1111-4111-8111-111111111111',
    });

    expect(
      ResolveKnowledgeNoteReferenceSchema.safeParse({
        reference: '',
      }).success,
    ).toBe(false);
  });

  it('accepts browse, ranked-search, and recent cursors for note catalogs', () => {
    expect(ListKnowledgeNoteProjectionsSchema.parse({ sort: 'recent', limit: '24' })).toMatchObject(
      {
        sort: 'recent',
        limit: 24,
      },
    );

    expect(
      ListKnowledgeProjectionsSchema.parse({
        cursor: 'b~ei8xcGFzc3dvcmQubWQ~knowledge-note-1',
        limit: '50',
      }).cursor,
    ).toBe('b~ei8xcGFzc3dvcmQubWQ~knowledge-note-1');

    expect(
      ListKnowledgeProjectionsSchema.parse({
        cursor: 'q~2500~1759017600000~knowledge-note-1',
        limit: '50',
      }).cursor,
    ).toBe('q~2500~1759017600000~knowledge-note-1');

    expect(
      ListKnowledgeNoteProjectionsSchema.parse({
        cursor: 'r~1759017600000~knowledge-note-1',
        limit: '50',
      }).cursor,
    ).toBe('r~1759017600000~knowledge-note-1');

    expect(
      ListKnowledgeProjectionsSchema.safeParse({
        cursor: 'offset:50',
        limit: '50',
      }).success,
    ).toBe(false);
    expect(
      ListKnowledgeProjectionsSchema.safeParse({
        cursor: `q~${'9'.repeat(80)}~1759017600000~knowledge-note-1`,
        limit: '50',
      }).success,
    ).toBe(false);
  });

  it('models durable reference candidates as a first-class knowledge-document query', () => {
    expect(
      ListReferenceableKnowledgeDocumentsSchema.parse({
        query: ' password ',
        cursor: 'r~1759017600000~knowledge-note-1',
        limit: '24',
      }),
    ).toEqual({
      query: 'password',
      cursor: 'r~1759017600000~knowledge-note-1',
      limit: 24,
    });

    const response = ReferenceableKnowledgeDocumentListResponseSchema.parse({
      documents: [
        {
          knowledgeSpaceId: 'KnowledgeSpaceId_11111111-1111-4111-8111-111111111111',
          documentId: 'kdoc_22222222-2222-4222-8222-222222222222',
          projectionId: 'projection-181',
          connectionId: 'connection-1',
          title: '1Password',
          relativePath: 'z/1password.md',
          updatedAt: 1759017600000,
        },
      ],
      total: 1,
      nextCursor: null,
    });

    expect(response.documents[0]).toMatchObject({
      documentId: 'kdoc_22222222-2222-4222-8222-222222222222',
      title: '1Password',
    });
  });
});
