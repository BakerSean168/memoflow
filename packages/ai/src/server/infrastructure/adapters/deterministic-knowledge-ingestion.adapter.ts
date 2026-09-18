import { createHash } from 'node:crypto';
import type {
  IKnowledgeIngestionPort,
  KnowledgeIndexedChunk,
  KnowledgeIndexedNote,
  KnowledgeIngestionInput,
} from '../../application/ports';
import { buildRetrievalEmbedding, tokenize } from './knowledge-index-value-helpers';

const DEFAULT_CHUNK_CHARS = 2800;
const DEFAULT_OVERLAP_CHARS = 280;
const MAX_KEYWORDS = 24;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function cleanMarkdownForSummary(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[>*_~\[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(value: string): string[] {
  const counts = new Map<string, number>();
  for (const token of tokenize(value)) {
    if (token.length < 2) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, MAX_KEYWORDS)
    .map(([token]) => token);
}

function headingsBefore(content: string, offset: number): string[] {
  const headings: string[] = [];
  for (const line of content.slice(0, offset).split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const level = match[1].length;
    headings.length = Math.min(headings.length, level - 1);
    headings[level - 1] = match[2];
  }
  return headings.filter(Boolean);
}

function splitIntoChunks(
  content: string,
  maxChunkChars: number,
  overlapChars: number,
): KnowledgeIndexedChunk[] {
  if (!content.trim()) return [];
  const chunks: KnowledgeIndexedChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < content.length) {
    let end = Math.min(start + maxChunkChars, content.length);
    if (end < content.length) {
      const paragraphBreak = content.lastIndexOf('\n\n', end);
      const lineBreak = content.lastIndexOf('\n', end);
      const preferred = Math.max(paragraphBreak, lineBreak);
      if (preferred > start + Math.floor(maxChunkChars * 0.55)) end = preferred;
    }
    const raw = content.slice(start, end).trim();
    if (raw) {
      chunks.push({
        chunkIndex: index,
        content: raw,
        contentHash: sha256(raw),
        startOffset: start,
        endOffset: end,
        headingPath: headingsBefore(content, start),
        keywords: extractKeywords(raw),
        embedding: buildRetrievalEmbedding(raw),
      });
      index += 1;
    }
    if (end >= content.length) break;
    const next = Math.max(end - overlapChars, start + 1);
    start = next;
  }
  return chunks;
}

/**
 * Framework-independent knowledge indexer used by both API and Desktop hosts.
 * It intentionally performs only deterministic text processing: chunking,
 * lexical keywords and stable local retrieval vectors. No provider call is
 * needed to keep the knowledge index fresh.
 */
export class DeterministicKnowledgeIngestionAdapter implements IKnowledgeIngestionPort {
  async indexNote(input: KnowledgeIngestionInput): Promise<KnowledgeIndexedNote> {
    if (!input.note.knowledgeDocumentId) {
      throw new Error('Knowledge indexing requires a stable KnowledgeDocumentId');
    }
    const maxChunkChars = Math.max(600, input.maxChunkChars ?? DEFAULT_CHUNK_CHARS);
    const overlapChars = Math.min(
      Math.max(0, input.overlapChars ?? DEFAULT_OVERLAP_CHARS),
      Math.floor(maxChunkChars / 3),
    );
    const sourceContentHash = input.note.sourceContentHash || sha256(input.note.content);
    const summarySource = cleanMarkdownForSummary(input.note.content);
    const summary = summarySource.slice(0, 800);
    const keywords = extractKeywords(
      [input.note.title ?? '', input.note.sourcePath, input.note.content].join('\n'),
    );

    return {
      identityId: input.note.identityId,
      repositoryId: input.note.repositoryId,
      knowledgeSpaceId: input.note.knowledgeSpaceId,
      knowledgeDocumentId: input.note.knowledgeDocumentId,
      sourcePath: input.note.sourcePath,
      sourceContentHash,
      sourceVersion: input.note.sourceVersion,
      title: input.note.title,
      mimeType: input.note.mimeType,
      summary,
      keywords,
      embedding: buildRetrievalEmbedding(
        [input.note.title ?? '', input.note.sourcePath, summary, keywords.join(' ')].join(' '),
      ),
      chunks: splitIntoChunks(input.note.content, maxChunkChars, overlapChars),
      metadata: { ...(input.note.metadata ?? {}) },
    };
  }
}
