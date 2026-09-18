/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 3 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: knowledge-index-value-helpers-dual.surface.spec.ts, score-indexed-resource-dual.surface.spec.ts, with-observability-payload-dual.surface.spec.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  toChunkArray,
  toNumberArray,
  toStringArray,
  tokenize,
  scoreIndexedResource,
} from './knowledge-index-value-helpers';
import { withObservabilityPayload } from './with-observability-payload';
import type { KnowledgeIndexedNote, AIExecutionLogInput } from '../../application/ports';

// --- merged from knowledge-index-value-helpers-dual.surface.spec.ts ---
{
  /**
   * Residual 969: knowledge-index value helper duals retired.
   * Sole body in knowledge-index-value-helpers.ts; PowerSync + Prisma repositories import it.
   * Soft residual 967: isAbortLikeError dual retired (shared/is-abort-like-error-dual.surface.spec.ts).
   * Soft residual 974: tip focused suite numbers track Residual 974 evidence tip (278/1223).
   * Soft residual 971: withObservabilityPayload dual retired (with-observability-payload-dual.surface.spec.ts).
   * Soft residual 1109: toStringArray keep-boundary vs goal-planning trim + portable parseJsonField.
   * Soft residual 1153: API repository-knowledge-source tokenize CJK keep-boundary remains separate.
   * Soft residual 1195: scoreIndexedResource dual retired (score-indexed-resource-dual.surface.spec.ts).
   * Does not flip §13.2 checkboxes.
   */
  describe('knowledge-index value helpers dual retired (residual 969)', () => {
    const adaptersDir = __dirname;
    const sole = readFileSync(resolve(adaptersDir, 'knowledge-index-value-helpers.ts'), 'utf8');
    const powersync = readFileSync(
      resolve(adaptersDir, 'powersync/ai-knowledge-index-powersync.repository.ts'),
      'utf8',
    );
    const prisma = readFileSync(
      resolve(adaptersDir, 'prisma/ai-knowledge-index-prisma.repository.ts'),
      'utf8',
    );

    it('owns sole knowledge-index value helper bodies', () => {
      expect(sole).toContain('Residual 969');
      expect(sole).toMatch(/export function toStringArray\b/);
      expect(sole).toMatch(/export function toNumberArray\b/);
      expect(sole).toMatch(/export function tokenize\b/);
      expect(sole).toMatch(/export function toChunkArray\b/);
      expect(sole).toContain('KnowledgeIndexedChunk');
    });

    it('PowerSync + Prisma repositories import sole without local dual bodies', () => {
      for (const [label, source] of [
        ['powersync', powersync],
        ['prisma', prisma],
      ] as const) {
        expect(source, label).toContain('Residual 969');
        expect(source, label).toContain("from '../knowledge-index-value-helpers'");
        expect(source, label).not.toMatch(/function toStringArray\b/);
        expect(source, label).not.toMatch(/function toNumberArray\b/);
        expect(source, label).not.toMatch(/function tokenize\b/);
        expect(source, label).not.toMatch(/function toChunkArray\b/);
        expect(source, label).toContain('toStringArray(');
        expect(source, label).toContain('toNumberArray(');
        expect(source, label).toContain('toChunkArray(');
        // Residual 1195: tokenize only used inside scoreIndexedResource sole (may not appear in repo callers).
        expect(source, label).toContain('scoreIndexedResource(');
      }
    });

    it('coerces arrays/tokens/chunks for knowledge index storage shapes', () => {
      expect(toStringArray(['a', 1, 'b'])).toEqual(['a', 'b']);
      expect(toNumberArray([1, 'x', 2])).toEqual([1, 2]);
      expect(tokenize('Hello_World x')).toEqual(['hello_world']);
      expect(
        toChunkArray([
          {
            chunkIndex: 1,
            content: 'body',
            contentHash: 'h',
            startOffset: 0,
            endOffset: 4,
            headingPath: ['A'],
            keywords: ['k'],
            embedding: [0.1],
          },
          { content: '' },
        ]),
      ).toEqual([
        {
          chunkIndex: 1,
          content: 'body',
          contentHash: 'h',
          startOffset: 0,
          endOffset: 4,
          headingPath: ['A'],
          keywords: ['k'],
          embedding: [0.1],
        },
      ]);
    });
  });
}

// --- merged from score-indexed-resource-dual.surface.spec.ts ---
{
  /**
   * Residual 1195: scoreIndexedResource dual retired onto knowledge-index-value-helpers sole.
   * Prisma hybrid path passes semanticScore; PowerSync uses default 0 lexical scoring.
   * Soft residual 969: toStringArray/toNumberArray/tokenize/toChunkArray duals already retired.
   * Soft residual 1153: API repository-knowledge-source tokenize CJK keep-boundary remains separate.
   * Does not flip §13.2 checkboxes.
   */
  describe('scoreIndexedResource dual retired (residual 1195)', () => {
    const dir = __dirname;
    const sole = readFileSync(resolve(dir, 'knowledge-index-value-helpers.ts'), 'utf8');
    const powersync = readFileSync(
      resolve(dir, 'powersync/ai-knowledge-index-powersync.repository.ts'),
      'utf8',
    );
    const prisma = readFileSync(
      resolve(dir, 'prisma/ai-knowledge-index-prisma.repository.ts'),
      'utf8',
    );

    const sample: KnowledgeIndexedNote = {
      identityId: 'i1',
      repositoryId: 'r1',
      knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440011',
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440012',
      sourcePath: 'docs/readme.md',
      sourceContentHash: 'h',
      sourceVersion: 'commit-1',
      title: 'Hello World',
      mimeType: 'text/markdown',
      summary: 'Intro to scoring',
      keywords: ['hello', 'world'],
      embedding: [],
      chunks: [],
      metadata: {},
    };

    it('owns sole scoreIndexedResource helper body', () => {
      expect(sole).toContain('Residual 1195');
      expect(sole).toMatch(/export function scoreIndexedResource\b/);
      expect(sole).toContain('semanticScore = 0');
      expect(sole).toContain('semanticScore * 4');
      expect(sole).toContain('tokenize(trimmedQuery)');
    });

    it('retires PowerSync + Prisma local dual bodies onto sole import', () => {
      for (const [label, source] of [
        ['powersync', powersync],
        ['prisma', prisma],
      ] as const) {
        expect(source, label).toContain('Soft residual 1195');
        expect(source, label).toContain('scoreIndexedResource');
        expect(source, label).toContain("from '../knowledge-index-value-helpers'");
        expect(source, label).not.toMatch(/function scoreIndexedResource\b/);
      }
      expect(prisma).toContain('scoreIndexedResource(resource, query, Math.max');
      expect(powersync).toContain('scoreIndexedResource(resource, query)');
    });

    it('runtime: lexical scoring + optional semantic boost', () => {
      expect(scoreIndexedResource(sample, '')).toBe(1);
      expect(scoreIndexedResource(sample, '', 0.5)).toBe(0.5);
      const lexical = scoreIndexedResource(sample, 'hello docs');
      expect(lexical).toBeGreaterThan(0);
      const hybrid = scoreIndexedResource(sample, 'hello docs', 1);
      expect(hybrid).toBe(lexical + 4);
    });

    it('documents residual 1195 lock intent without claiming §13.2 complete', () => {
      const self = readFileSync(resolve(dir, 'dual-registry.surface.spec.ts'), 'utf8');
      expect(self).toContain('Residual 1195');
      expect(self).toContain('Does not flip §13.2 checkboxes');
      expect(self).toContain('dual retired');
    });
  });
}

// --- merged from with-observability-payload-dual.surface.spec.ts ---
{
  /**
   * Residual 971: withObservabilityPayload dual retired.
   * Sole body in with-observability-payload.ts; PowerSync + Prisma execution-log adapters import it.
   * Soft residual 969: knowledge-index value helpers dual retired
   *   (knowledge-index-value-helpers-dual.surface.spec.ts).
   * Soft residual 976: tip focused suite numbers track Residual 976 evidence tip (278/1224).
   * Soft residual 973: createComposableHandleError dual retired (packages/app-vue/src/shared/utils/create-composable-handle-error-dual.surface.spec.ts).
   * Does not flip §13.2 checkboxes.
   */
  describe('withObservabilityPayload dual retired (residual 971)', () => {
    const adaptersDir = __dirname;
    const sole = readFileSync(resolve(adaptersDir, 'with-observability-payload.ts'), 'utf8');
    const powersync = readFileSync(
      resolve(adaptersDir, 'powersync/ai-execution-log-powersync.adapter.ts'),
      'utf8',
    );
    const prisma = readFileSync(
      resolve(adaptersDir, 'prisma/ai-execution-log-prisma.adapter.ts'),
      'utf8',
    );

    it('owns sole withObservabilityPayload helper body', () => {
      expect(sole).toContain('Residual 971');
      expect(sole).toMatch(/export function withObservabilityPayload\b/);
      expect(sole).toContain('__observability');
      expect(sole).toContain('AIExecutionLogInput');
      expect(sole).toContain('errorCategory');
    });

    it('PowerSync + Prisma execution-log adapters import sole without local dual bodies', () => {
      for (const [label, source] of [
        ['powersync', powersync],
        ['prisma', prisma],
      ] as const) {
        expect(source, label).toContain('Residual 971');
        expect(source, label).toContain(
          "import { withObservabilityPayload } from '../with-observability-payload'",
        );
        expect(source, label).not.toMatch(/function withObservabilityPayload\b/);
        expect(source, label).toContain('withObservabilityPayload(');
      }
    });

    it('merges defined observability fields onto payload', () => {
      const base = { kind: 'chat' };
      const emptyInput = {
        identityId: 'id-1',
        conversationId: null,
        messageId: null,
        model: 'm',
        providerId: 'p',
        providerName: 'pn',
        requestId: undefined,
        errorCategory: undefined,
        costEstimate: undefined,
        usage: null,
        latencyMs: 0,
        status: 'ok',
        errorMessage: null,
        payload: {},
      } as unknown as AIExecutionLogInput;
      // Still has defined model/provider fields → observability present
      expect(withObservabilityPayload(base, emptyInput).__observability).toEqual({
        providerId: 'p',
        providerName: 'pn',
        model: 'm',
      });

      const sparse = {
        ...emptyInput,
        model: undefined,
        providerId: undefined,
        providerName: undefined,
        requestId: 'req-1',
      } as unknown as AIExecutionLogInput;
      expect(withObservabilityPayload(base, sparse)).toEqual({
        kind: 'chat',
        __observability: {
          requestId: 'req-1',
        },
      });

      const none = {
        ...emptyInput,
        model: undefined,
        providerId: undefined,
        providerName: undefined,
      } as unknown as AIExecutionLogInput;
      expect(withObservabilityPayload(base, none)).toEqual(base);
    });
  });
}
