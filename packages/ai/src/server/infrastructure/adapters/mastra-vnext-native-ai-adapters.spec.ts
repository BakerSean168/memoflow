import { describe, expect, it, vi } from 'vitest';
import { DeterministicKnowledgeIngestionAdapter } from './deterministic-knowledge-ingestion.adapter';
import { OpenAICompatibleKnowledgeQueryAdapter } from './openai-compatible-knowledge-query.adapter';
import { OpenAICompatibleAnalyticsQueryAdapter } from './openai-compatible-analytics-query.adapter';
import type { OpenAICompatibleGateway } from '../gateways/openai-compatible.gateway';

const provider = {
  providerId: 'provider-1',
  providerType: 'openai_compatible' as const,
  baseUrl: 'https://example.test/v1',
  apiKey: 'secret',
  model: 'test-model',
};

describe('Mastra vNext native AI adapters', () => {
  it('indexes markdown deterministically without a provider call and retains CJK retrieval terms', async () => {
    const adapter = new DeterministicKnowledgeIngestionAdapter();
    const indexed = await adapter.indexNote({
      note: {
        identityId: 'identity-1',
        repositoryId: 'repo-1',
        resourceId: 'note-1',
        resourcePath: '知识/架构.md',
        title: 'AI 架构设计',
        mimeType: 'text/markdown',
        content: '# 架构\n\nMemoFlow 使用 Mastra 作为唯一 Agent runtime。\n\n## 约束\n\n业务写入必须经过 application port。',
      },
    });
    expect(indexed.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(indexed.chunks).toHaveLength(1);
    expect(indexed.keywords.some((value) => value.includes('架构'))).toBe(true);
    expect(indexed.embedding.some((value) => value !== 0)).toBe(true);
  });

  it('answers knowledge queries from selected indexed chunks through the BYOK gateway', async () => {
    const complete = vi.fn(async () => ({
      content: 'Mastra is the single runtime.',
      usage: { promptTokens: 10, completionTokens: 6, totalTokens: 16 },
    }));
    const adapter = new OpenAICompatibleKnowledgeQueryAdapter({ complete } as unknown as OpenAICompatibleGateway);
    const result = await adapter.query({
      identityId: 'identity-1',
      providerConfig: provider,
      question: 'What runtime is used?',
      indexedNotes: [
        {
          identityId: 'identity-1',
          repositoryId: 'repo-1',
          resourceId: 'note-1',
          resourcePath: 'architecture.md',
          title: 'Architecture',
          mimeType: 'text/markdown',
          contentHash: 'hash',
          summary: 'Mastra is the single runtime.',
          keywords: ['mastra', 'runtime'],
          embedding: [],
          metadata: {},
          chunks: [
            {
              chunkIndex: 0,
              content: 'MemoFlow uses Mastra as the single Agent and Workflow runtime.',
              contentHash: 'chunk-hash',
              startOffset: 0,
              endOffset: 64,
              headingPath: ['Architecture'],
              keywords: ['mastra', 'runtime'],
              embedding: [],
            },
          ],
        },
      ],
      maxCitations: 3,
    });
    expect(result.answer).toContain('Mastra');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]?.resourceId).toBe('note-1');
    expect(complete).toHaveBeenCalledTimes(1);
    const request = complete.mock.calls[0]?.[0];
    expect(JSON.stringify(request)).not.toContain('Authorization');
  });

  it('synthesizes analytics JSON from an identity-scoped host snapshot', async () => {
    const complete = vi.fn(async () => ({
      content: JSON.stringify({ answer: 'Three tasks remain.', highlights: ['3 open tasks'] }),
      usage: { promptTokens: 8, completionTokens: 5, totalTokens: 13 },
    }));
    const adapter = new OpenAICompatibleAnalyticsQueryAdapter({ complete } as unknown as OpenAICompatibleGateway);
    const result = await adapter.query({
      identityId: 'identity-1',
      providerConfig: provider,
      question: 'What should I focus on?',
      context: {
        timeContext: { timeZone: 'Asia/Tokyo' as never, weekStartsOn: 1 },
        goals: [],
        goalSearchResults: [],
        extra: {},
        taskDashboard: { open: 3 },
      },
    });
    expect(result.answer).toBe('Three tasks remain.');
    expect(result.highlights).toEqual(['3 open tasks']);
    expect(result.usage.totalTokens).toBe(13);
  });
});
