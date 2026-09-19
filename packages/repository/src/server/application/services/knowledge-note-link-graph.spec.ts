import { describe, expect, it } from 'vitest';
import type { KnowledgeNoteProjectionClientDTO } from '@memoflow/contracts/repository';
import { buildKnowledgeNoteLinkGraph } from './knowledge-note-link-graph';

function note(
  id: string,
  relativePath: string,
  markdownContent: string,
  options: { title?: string; frontmatter?: Record<string, unknown> } = {},
): KnowledgeNoteProjectionClientDTO {
  return {
    id,
    connectionId: 'connection-1',
    relativePath,
    title: options.title ?? relativePath.split('/').at(-1)!.replace(/\.md$/i, ''),
    commitSha: 'commit-1',
    blobSha: `blob-${id}`,
    contentHash: `hash-${id}`,
    frontmatter: options.frontmatter ?? {},
    markdownContent,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  };
}

describe('buildKnowledgeNoteLinkGraph', () => {
  it('resolves paths, aliases, headings, and embeds while ignoring non-content Markdown', () => {
    const graph = buildKnowledgeNoteLinkGraph(
      'center',
      [
        note(
          'center',
          'guides/Center.md',
          [
            '# Center',
            'See [[Architecture#Overview|system design]] and ![[Neighbor]].',
            '`[[Inline Code]]`',
            '```md',
            '[[Fenced Code]]',
            '```',
            '<!-- [[Commented]] -->',
            'Missing [[Unknown]].',
          ].join('\n'),
        ),
        note('architecture', 'reference/Architecture.md', '# Architecture', {
          frontmatter: { aliases: ['Architecture'] },
        }),
        note('neighbor', 'guides/Neighbor.md', '# Neighbor'),
      ],
      { depth: 1, maxNodes: 40 },
    );

    expect(graph.nodes.map((item) => item.projectionId)).toEqual([
      'center',
      'neighbor',
      'architecture',
    ]);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceProjectionId: 'center',
          targetProjectionId: 'architecture',
          alias: 'system design',
          section: 'Overview',
          embedded: false,
        }),
        expect.objectContaining({
          sourceProjectionId: 'center',
          targetProjectionId: 'neighbor',
          embedded: true,
        }),
      ]),
    );
    expect(graph.unresolvedLinks).toEqual([
      expect.objectContaining({ target: 'Unknown', reason: 'not_found' }),
    ]);
    expect(graph.edges.some((edge) => edge.target.includes('Code'))).toBe(false);
    expect(graph.nodes[0]).toMatchObject({
      projectionId: 'center',
      outgoingLinkCount: 3,
      backlinkCount: 0,
      isCenter: true,
    });
  });

  it('does not invent an edge for ambiguous basename or alias matches', () => {
    const graph = buildKnowledgeNoteLinkGraph(
      'center',
      [
        note('center', 'Center.md', 'See [[Duplicate]] and [[Shared Alias]].'),
        note('duplicate-a', 'a/Duplicate.md', '# A', {
          frontmatter: { aliases: ['Shared Alias'] },
        }),
        note('duplicate-b', 'b/Duplicate.md', '# B', {
          frontmatter: { aliases: ['Shared Alias'] },
        }),
      ],
      { depth: 1, maxNodes: 40 },
    );

    expect(graph.edges).toEqual([]);
    expect(graph.unresolvedLinks).toEqual([
      expect.objectContaining({ target: 'Duplicate', reason: 'ambiguous' }),
      expect.objectContaining({ target: 'Shared Alias', reason: 'ambiguous' }),
    ]);
  });

  it('prefers a source-relative path before ambiguous loose matches', () => {
    const graph = buildKnowledgeNoteLinkGraph(
      'center',
      [
        note('center', 'a/Center.md', 'See [[Duplicate]].'),
        note('duplicate-a', 'a/Duplicate.md', '# A'),
        note('duplicate-b', 'b/Duplicate.md', '# B'),
      ],
      { depth: 1, maxNodes: 40 },
    );

    expect(graph.edges).toEqual([
      expect.objectContaining({
        sourceProjectionId: 'center',
        targetProjectionId: 'duplicate-a',
      }),
    ]);
  });

  it('walks incoming and outgoing links to the requested depth and reports truncation', () => {
    const notes = [
      note('a', 'A.md', '[[B]]'),
      note('b', 'B.md', '[[C]]'),
      note('c', 'C.md', '[[D]]'),
      note('d', 'D.md', ''),
    ];

    const depthOne = buildKnowledgeNoteLinkGraph('a', notes, { depth: 1, maxNodes: 40 });
    const depthTwo = buildKnowledgeNoteLinkGraph('a', notes, { depth: 2, maxNodes: 40 });
    const limited = buildKnowledgeNoteLinkGraph('a', notes, { depth: 3, maxNodes: 2 }, true);

    expect(depthOne.nodes.map((item) => item.projectionId)).toEqual(['a', 'b']);
    expect(depthTwo.nodes.map((item) => item.projectionId)).toEqual(['a', 'b', 'c']);
    expect(limited.nodes).toHaveLength(2);
    expect(limited.truncated).toBe(true);
  });
});
