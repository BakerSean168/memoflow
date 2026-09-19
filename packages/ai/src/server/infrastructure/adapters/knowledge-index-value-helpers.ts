/**
 * Residual 969: sole knowledge-index value helpers for PowerSync + Prisma repositories.
 * toStringArray / toNumberArray / tokenize / toChunkArray duals retired.
 * Residual 1109 keep-boundary: toStringArray keeps empty strings (no trim).
 * Soft residual 1109: goal-planning trims/non-empty; data-portability parseJsonField first (no force-merge).
 * Residual 1195: scoreIndexedResource dual retired (Prisma semanticScore + PowerSync lexical).
 */

import { createHash } from 'node:crypto';
import type { KnowledgeIndexedChunk, KnowledgeIndexedNote } from '../../application/ports';

const RETRIEVAL_VECTOR_DIMENSION = 48;

// Residual 1109 keep-boundary: array filter typeof string only (keeps empty; no trim; no JSON parse).
export function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function toNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : [];
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_\u4e00-\u9fff]+/g) ?? []).filter(
    (token) => token.length > 1,
  );
}

export function toChunkArray(value: unknown): KnowledgeIndexedChunk[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const row = item as Record<string, unknown>;
      return {
        chunkIndex: typeof row.chunkIndex === 'number' ? row.chunkIndex : 0,
        content: typeof row.content === 'string' ? row.content : '',
        contentHash: typeof row.contentHash === 'string' ? row.contentHash : '',
        startOffset: typeof row.startOffset === 'number' ? row.startOffset : 0,
        endOffset: typeof row.endOffset === 'number' ? row.endOffset : 0,
        headingPath: toStringArray(row.headingPath),
        keywords: toStringArray(row.keywords),
        embedding: toNumberArray(row.embedding),
      } satisfies KnowledgeIndexedChunk;
    })
    .filter((item): item is KnowledgeIndexedChunk => item !== null && item.content.length > 0);
}

/**
 * Residual 1195: sole knowledge-index scoreIndexedResource.
 * Lexical keyword/path/title/summary scoring; optional semanticScore boost (Prisma hybrid).
 * Empty query → semanticScore if > 0 else 1.
 */
export function scoreIndexedResource(
  resource: KnowledgeIndexedNote,
  query: string,
  semanticScore = 0,
): number {
  const trimmedQuery = query.trim().toLowerCase();
  if (trimmedQuery.length === 0) {
    return semanticScore > 0 ? semanticScore : 1;
  }

  const tokens = new Set(tokenize(trimmedQuery));
  const keywordSet = new Set(resource.keywords.map((keyword) => keyword.toLowerCase()));
  const haystack =
    `${resource.title ?? ''} ${resource.sourcePath} ${resource.summary} ${resource.keywords.join(' ')}`.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (keywordSet.has(token)) {
      score += 3;
      continue;
    }
    if (haystack.includes(token)) {
      score += 1;
    }
  }

  if ((resource.title ?? '').toLowerCase().includes(trimmedQuery)) {
    score += 3;
  }
  if (resource.sourcePath.toLowerCase().includes(trimmedQuery)) {
    score += 2;
  }
  if (resource.summary.toLowerCase().includes(trimmedQuery)) {
    score += 2;
  }

  return score + semanticScore * 4;
}

function charNGrams(token: string, minSize = 3, maxSize = 5): string[] {
  const padded = `^${token}$`;
  const grams: string[] = [];
  for (let size = minSize; size <= Math.min(maxSize, padded.length); size += 1) {
    for (let index = 0; index <= padded.length - size; index += 1) {
      grams.push(padded.slice(index, index + size));
    }
  }
  return grams;
}

function projectFeature(feature: string): { bucket: number; sign: number } {
  const digest = createHash('sha256').update(feature).digest();
  const bucket = digest.readUInt32BE(0) % RETRIEVAL_VECTOR_DIMENSION;
  const sign = digest[4] % 2 === 0 ? 1 : -1;
  return { bucket, sign };
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function buildRetrievalEmbedding(text: string): number[] {
  const tokenCounts = new Map<string, number>();
  for (const token of tokenize(text)) {
    tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
  }

  const vector = Array.from({ length: RETRIEVAL_VECTOR_DIMENSION }, () => 0);
  for (const [token, count] of tokenCounts) {
    const tokenProjection = projectFeature(`tok:${token}`);
    vector[tokenProjection.bucket] += tokenProjection.sign * (1 + Math.log1p(count));

    for (const gram of charNGrams(token)) {
      const gramProjection = projectFeature(`ng:${gram}`);
      vector[gramProjection.bucket] += gramProjection.sign * (0.2 * count);
    }
  }

  return normalizeVector(vector);
}

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => Number(value.toFixed(6))).join(',')}]`;
}
