import { describe, expect, it, vi } from 'vitest';
import {
  AIProviderType,
  type ExpandKnowledgeReq,
  type QueryAnalyticsReq,
  type QueryKnowledgeReq,
} from '@memoflow/contracts/ai';

import type { IAIProviderConfigRepository } from '../../../../domain/repositories/i-ai-provider-config-repository';
import type {
  AIExecutionLogInput,
  AnalyticsQueryContext,
  AnalyticsQueryInput,
  AnalyticsQueryResult,
  IAIExecutionLogPort,
  IAnalyticsQueryPort,
  IAnalyticsReadPort,
  IKnowledgeIndexRepository,
  IKnowledgeIndexStatusPort,
  IKnowledgeIngestionPort,
  IKnowledgeQueryPort,
  IKnowledgeSourcePort,
  KnowledgeIndexDiagnostics,
  KnowledgeExpansionInput,
  KnowledgeExpansionResult,
  KnowledgeIngestionInput,
  KnowledgeIndexedNote,
  KnowledgeQueryInput,
  KnowledgeQueryResult,
  KnowledgeSourceNote,
} from '../../../ports';
import { QueryAIAnalyticsUseCase } from '../query-ai-analytics.use-case';
import { SyncRelevantKnowledgeUseCase } from '../sync-relevant-knowledge.use-case';
import { SyncKnowledgeNotesUseCase } from '../sync-knowledge-notes.use-case';
import { ReindexAllKnowledgeUseCase } from '../reindex-all-knowledge.use-case';
import { QueryKnowledgeUseCase } from '../query-knowledge.use-case';
import { ExpandKnowledgeUseCase } from '../expand-knowledge.use-case';
import { ReindexKnowledgeUseCase } from '../reindex-knowledge.use-case';
import { SyncNoteByIdUseCase } from '../sync-note-by-id.use-case';
import {
  createAIModuleForTests,
  createAIProviderConfigRepositoryStub,
  createAIProviderConfigServerDTO,
} from '../../../../../testing';

class StubProviderConfigRepository {
  constructor(
    private readonly providers: Array<{
      id: string;
      identityId: string;
      providerType: string;
      baseUrl: string;
      apiKey: string;
      defaultModel: string | null;
      isActive: boolean;
      isDefault?: boolean;
      name: string;
    }>,
  ) {}

  async findByIdForIdentity(identityId: string, id: string) {
    const provider = this.providers.find((item) => item.id === id) ?? null;
    if (!provider || provider.identityId !== identityId) {
      return null;
    }
    return provider;
  }

  async findDefaultByIdentityId(identityId: string) {
    return (
      this.providers.find((provider) => provider.identityId === identityId && provider.isDefault) ??
      null
    );
  }

  async findByIdentityId(identityId: string) {
    return this.providers.filter((provider) => provider.identityId === identityId);
  }
}

class StubKnowledgeSourcePort implements IKnowledgeSourcePort {
  public readonly getNoteById = vi.fn<
    (identityId: string, resourceId: string) => Promise<KnowledgeSourceNote | null>
  >(async (identityId, resourceId) => ({
    identityId,
    repositoryId: 'repo-1',
    resourceId,
    resourcePath: resourceId === 'resource-1' ? 'notes/python-ai.md' : `notes/${resourceId}.md`,
    title: resourceId === 'resource-1' ? 'Python AI' : resourceId,
    mimeType: 'text/markdown',
    content: 'Repository-backed answers are enabled.',
    metadata: {},
  }));

  public readonly listRelevantNotes = vi.fn<
    (identityId: string, query: string, limit: number) => Promise<KnowledgeSourceNote[]>
  >(async () => [
    {
      identityId: 'identity-1',
      repositoryId: 'repo-1',
      resourceId: 'resource-1',
      resourcePath: 'notes/python-ai.md',
      title: 'Python AI',
      mimeType: 'text/markdown',
      content: 'Repository-backed answers are enabled.',
      metadata: {},
    },
  ]);

  public readonly listIndexableNotes = vi.fn<
    (identityId: string, limit: number) => Promise<KnowledgeSourceNote[]>
  >(async (identityId, limit) => this.listRelevantNotes(identityId, '', limit));
}

class StubKnowledgeIngestionPort implements IKnowledgeIngestionPort {
  public readonly indexNote = vi.fn<
    (input: KnowledgeIngestionInput) => Promise<KnowledgeIndexedNote>
  >(async (input) => ({
    identityId: input.note.identityId,
    repositoryId: input.note.repositoryId,
    resourceId: input.note.resourceId,
    resourcePath: input.note.resourcePath,
    title: input.note.title,
    mimeType: input.note.mimeType,
    contentHash: 'hash-1',
    summary: 'Repository-backed answers are enabled.',
    keywords: ['repository', 'answers'],
    embedding: [0.2, 0.8],
    chunks: [
      {
        chunkIndex: 0,
        content: input.note.content,
        contentHash: 'hash-1',
        startOffset: 0,
        endOffset: input.note.content.length,
        headingPath: ['Python AI'],
        keywords: ['repository', 'answers'],
        embedding: [0.2, 0.8],
      },
    ],
    metadata: input.note.metadata ?? {},
  }));
}

class StubKnowledgeQueryPort implements IKnowledgeQueryPort {
  public readonly expand = vi.fn<
    (input: KnowledgeExpansionInput) => Promise<KnowledgeExpansionResult>
  >(async () => ({
    expandedContent: '# Expanded Note\n\nGrounded answers should cite knowledge notes.',
    citations: [
      {
        resourceId: 'resource-1',
        resourcePath: 'notes/python-ai.md',
        title: 'Python AI',
        chunkIndex: 0,
        excerpt: 'Repository-backed answers are enabled.',
        score: 2,
      },
    ],
    usage: {
      promptTokens: 22,
      completionTokens: 14,
      totalTokens: 36,
    },
  }));

  public readonly query = vi.fn<(input: KnowledgeQueryInput) => Promise<KnowledgeQueryResult>>(
    async () => ({
      answer: 'The repository notes confirm that grounded answers are enabled.',
      citations: [
        {
          resourceId: 'resource-1',
          resourcePath: 'notes/python-ai.md',
          title: 'Python AI',
          chunkIndex: 0,
          excerpt: 'Repository-backed answers are enabled.',
          score: 2,
        },
      ],
      usage: {
        promptTokens: 20,
        completionTokens: 10,
        totalTokens: 30,
      },
    }),
  );
}

class StubKnowledgeIndexRepository implements IKnowledgeIndexRepository {
  public readonly getDiagnostics = vi.fn<() => Promise<KnowledgeIndexDiagnostics>>(async () => ({
    persistenceBackend: 'prisma-index-table',
    persistenceStatus: 'enabled',
    vectorRecallBackend: 'local-js-hybrid',
    vectorRecallStatus: 'unknown',
    vectorRecallReason: 'Vector availability has not been probed in this test stub.',
  }));

  public readonly findByNoteIds = vi.fn<
    (identityId: string, resourceIds: string[]) => Promise<KnowledgeIndexedNote[]>
  >(async () => []);

  public readonly findRelevantNotes = vi.fn<
    (identityId: string, query: string, limit: number) => Promise<KnowledgeIndexedNote[]>
  >(async () => []);

  public readonly upsert = vi.fn<(resource: KnowledgeIndexedNote) => Promise<void>>(async () => {});

  public readonly markRequested = vi.fn<
    (identityId: string, resourceIds: string[], requestedAt: number) => Promise<void>
  >(async () => {});

  public readonly markFailed = vi.fn(async () => {});
  public readonly removeByNoteId = vi.fn(async () => {});
}

class StubKnowledgeIndexStatusPort implements IKnowledgeIndexStatusPort {
  public readonly updateIndexStatus = vi.fn(async () => {});
}

class StubExecutionLogPort implements IAIExecutionLogPort {
  public readonly record = vi.fn<(input: AIExecutionLogInput) => Promise<void>>(async () => {});
}

class StubAnalyticsReadPort implements IAnalyticsReadPort {
  public readonly buildContext = vi.fn<
    (identityId: string, question: string) => Promise<AnalyticsQueryContext>
  >(async () => ({
    timeContext: { timeZone: 'UTC' as never, weekStartsOn: 1 },
    dashboard: { stats: { activeGoals: 4 } },
    taskDashboard: { summary: { overdue: 2 } },
    goals: [],
    goalSearchResults: [],
    extra: {},
  }));
}

class StubAnalyticsQueryPort implements IAnalyticsQueryPort {
  public readonly query = vi.fn<(input: AnalyticsQueryInput) => Promise<AnalyticsQueryResult>>(
    async () => ({
      answer: 'Focus on the overdue tasks first.',
      highlights: ['activeGoals: 4', 'task.overdue: 2'],
      usage: {
        promptTokens: 18,
        completionTokens: 8,
        totalTokens: 26,
      },
    }),
  );
}

describe('SyncKnowledgeNotesUseCase', () => {
  it('records an indexing failure without conflating it with the persisted source note', async () => {
    const resource = (await new StubKnowledgeSourcePort().listIndexableNotes('identity-1', 1))[0]!;
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const ingestionPort = new StubKnowledgeIngestionPort();
    ingestionPort.indexNote.mockRejectedValueOnce(new Error('embedding provider unavailable'));
    const indexStatusPort = new StubKnowledgeIndexStatusPort();
    const service = new SyncKnowledgeNotesUseCase(
      knowledgeIndexRepository,
      ingestionPort,
      new StubExecutionLogPort(),
      indexStatusPort,
    );

    const result = await service.execute([resource], { identityId: 'identity-1' });

    expect(result).toEqual(
      expect.objectContaining({
        indexedCount: 0,
        failedCount: 1,
        results: [
          expect.objectContaining({
            resourceId: resource.resourceId,
            status: 'failed',
            error: 'embedding provider unavailable',
          }),
        ],
      }),
    );
    expect(knowledgeIndexRepository.upsert).not.toHaveBeenCalled();
    expect(knowledgeIndexRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: resource.resourceId,
        error: 'embedding provider unavailable',
      }),
    );
    expect(indexStatusPort.updateIndexStatus).toHaveBeenCalledWith(
      'identity-1',
      expect.objectContaining({
        resourceId: resource.resourceId,
        contentHash: expect.any(String),
        status: 'failed',
      }),
    );
  });

  it('reports a successful index without making status projection failures fatal', async () => {
    const resource = (await new StubKnowledgeSourcePort().listIndexableNotes('identity-1', 1))[0]!;
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const indexStatusPort = new StubKnowledgeIndexStatusPort();
    indexStatusPort.updateIndexStatus.mockRejectedValueOnce(new Error('projection unavailable'));
    const service = new SyncKnowledgeNotesUseCase(
      knowledgeIndexRepository,
      new StubKnowledgeIngestionPort(),
      new StubExecutionLogPort(),
      indexStatusPort,
    );

    const result = await service.execute([resource], { identityId: 'identity-1' });

    expect(result).toMatchObject({ indexedCount: 1, failedCount: 0 });
    expect(knowledgeIndexRepository.upsert).toHaveBeenCalledOnce();
    expect(indexStatusPort.updateIndexStatus).toHaveBeenCalledWith(
      'identity-1',
      expect.objectContaining({
        resourceId: resource.resourceId,
        contentHash: expect.any(String),
        status: 'indexed',
      }),
    );
  });
});

describe('AIKnowledgeQueryService', () => {
  it('reads resources, indexes them, and queries through the knowledge execution ports', async () => {
    const sourcePort = new StubKnowledgeSourcePort();
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const ingestionPort = new StubKnowledgeIngestionPort();
    const queryPort = new StubKnowledgeQueryPort();
    const executionLogPort = new StubExecutionLogPort();
    const syncRelevant = new SyncRelevantKnowledgeUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionLogPort,
    );
    const service = new QueryKnowledgeUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerType: AIProviderType.OpenAICompatible,
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'plain-secret',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      syncRelevant,
      queryPort,
      executionLogPort,
    );

    const result = await service.execute(
      {
        query: 'How does knowledge grounding work?',
      } satisfies QueryKnowledgeReq,
      {
        requestId: 'req-knowledge-1',
        traceId: 'req-knowledge-1',
        startedAt: 1_700_000_000_000,
        source: 'system',
        identityId: 'identity-1',
      },
    );

    expect(sourcePort.listRelevantNotes).toHaveBeenCalledWith(
      'identity-1',
      'How does knowledge grounding work?',
      32,
    );
    expect(ingestionPort.indexNote).toHaveBeenCalledTimes(1);
    expect(ingestionPort.indexNote).toHaveBeenCalledWith(
      expect.objectContaining({
        providerConfig: expect.objectContaining({
          model: 'gpt-4o-mini',
        }),
      }),
    );
    expect(knowledgeIndexRepository.upsert).toHaveBeenCalledTimes(1);
    expect(queryPort.query).toHaveBeenCalledTimes(1);
    expect(executionLogPort.record).toHaveBeenCalledTimes(2);
    expect(queryPort.query).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.any(String),
        providerConfig: expect.objectContaining({
          model: 'gpt-4o-mini',
        }),
      }),
    );
    for (const [call] of executionLogPort.record.mock.calls) {
      expect(call).toEqual(
        expect.objectContaining({
          requestId: expect.any(String),
        }),
      );
    }
    expect(executionLogPort.record.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        costEstimate: expect.objectContaining({
          pricingModel: 'gpt-4o-mini',
          totalCostUsd: expect.any(Number),
        }),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.answer).toContain('grounded');
    expect(result.data.citations[0]?.resourcePath).toBe('notes/python-ai.md');
    expect(result.data.providerId).toBe('provider-1');
    expect(result.data.matchedResourceCount).toBe(1);
  });

  it('backs off to broader indexable resources when lexical prefilter recall is too narrow', async () => {
    const sourcePort = new StubKnowledgeSourcePort();
    sourcePort.listRelevantNotes.mockResolvedValueOnce([]);
    sourcePort.listIndexableNotes.mockResolvedValueOnce([
      {
        identityId: 'identity-1',
        repositoryId: 'repo-1',
        resourceId: 'resource-1',
        resourcePath: 'notes/repository-grounding.md',
        title: 'Repository Grounding',
        mimeType: 'text/markdown',
        content: 'Grounded answers cite knowledge notes after retrieval.',
        metadata: {},
      },
    ]);
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const ingestionPort = new StubKnowledgeIngestionPort();
    const queryPort = new StubKnowledgeQueryPort();
    const executionLogPort = new StubExecutionLogPort();
    const syncRelevant = new SyncRelevantKnowledgeUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionLogPort,
    );
    const service = new QueryKnowledgeUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerType: AIProviderType.OpenAICompatible,
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'plain-secret',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      syncRelevant,
      queryPort,
      executionLogPort,
    );

    const result = await service.execute(
      {
        query: 'How does grounding from repos cite sources?',
      } satisfies QueryKnowledgeReq,
      {
        requestId: 'req-knowledge-1',
        traceId: 'req-knowledge-1',
        startedAt: 1_700_000_000_000,
        source: 'system',
        identityId: 'identity-1',
      },
    );

    expect(sourcePort.listRelevantNotes).toHaveBeenCalledWith(
      'identity-1',
      'How does grounding from repos cite sources?',
      32,
    );
    expect(sourcePort.listIndexableNotes).toHaveBeenCalledWith('identity-1', 32);
    expect(queryPort.query).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.answer).toContain('grounded');
  });

  it('prefers indexed retrieval-layer candidates before falling back to raw repository lexical search', async () => {
    const sourcePort = new StubKnowledgeSourcePort();
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    knowledgeIndexRepository.findRelevantNotes.mockResolvedValueOnce(
      Array.from({ length: 6 }, (_, index) => ({
        identityId: 'identity-1',
        repositoryId: 'repo-1',
        resourceId: `resource-${index + 1}`,
        resourcePath: `notes/resource-${index + 1}.md`,
        title: `Indexed Resource ${index + 1}`,
        mimeType: 'text/markdown',
        contentHash: `hash-${index + 1}`,
        summary: 'Indexed repository grounding guidance.',
        keywords: ['grounding', 'citation'],
        embedding: [0.2, 0.8],
        chunks: [],
        metadata: {},
      })),
    );
    const ingestionPort = new StubKnowledgeIngestionPort();
    const queryPort = new StubKnowledgeQueryPort();
    const executionLogPort = new StubExecutionLogPort();
    const syncRelevant = new SyncRelevantKnowledgeUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionLogPort,
    );
    const service = new QueryKnowledgeUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerType: AIProviderType.OpenAICompatible,
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'plain-secret',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      syncRelevant,
      queryPort,
      executionLogPort,
    );

    await service.execute(
      {
        query: 'How does repository grounding work?',
      } satisfies QueryKnowledgeReq,
      {
        requestId: 'req-knowledge-1',
        traceId: 'req-knowledge-1',
        startedAt: 1_700_000_000_000,
        source: 'system',
        identityId: 'identity-1',
      },
    );

    expect(knowledgeIndexRepository.findRelevantNotes).toHaveBeenCalledWith(
      'identity-1',
      'How does repository grounding work?',
      32,
    );
    expect(sourcePort.getNoteById).toHaveBeenCalledTimes(6);
    expect(sourcePort.listRelevantNotes).not.toHaveBeenCalled();
    expect(sourcePort.listIndexableNotes).not.toHaveBeenCalled();
  });

  it('expands knowledge drafts through the shared retrieval execution port', async () => {
    const sourcePort = new StubKnowledgeSourcePort();
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const ingestionPort = new StubKnowledgeIngestionPort();
    const queryPort = new StubKnowledgeQueryPort();
    const executionLogPort = new StubExecutionLogPort();
    const syncRelevant = new SyncRelevantKnowledgeUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionLogPort,
    );
    const service = new ExpandKnowledgeUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerType: AIProviderType.OpenAICompatible,
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'plain-secret',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      syncRelevant,
      queryPort,
      executionLogPort,
    );

    const result = await service.execute(
      {
        instruction: 'Expand this note with citation guidance.',
        currentContent: '# Repository Grounding',
      } satisfies ExpandKnowledgeReq,
      {
        requestId: 'req-knowledge-1',
        traceId: 'req-knowledge-1',
        startedAt: 1_700_000_000_000,
        source: 'system',
        identityId: 'identity-1',
      },
    );

    expect(queryPort.expand).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.any(String),
        instruction: 'Expand this note with citation guidance.',
        currentContent: '# Repository Grounding',
        providerConfig: expect.objectContaining({
          model: 'gpt-4o-mini',
        }),
      }),
    );
    expect(ingestionPort.indexNote).toHaveBeenCalledWith(
      expect.objectContaining({
        providerConfig: expect.objectContaining({
          model: 'gpt-4o-mini',
        }),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.expandedContent).toContain('Grounded answers');
    expect(result.data.citations[0]?.resourcePath).toBe('notes/python-ai.md');
    expect(result.data.providerId).toBe('provider-1');
    expect(result.data.matchedResourceCount).toBe(1);
  });

  it('reindexes knowledge with the active provider config so batch rebuilds can use provider embeddings', async () => {
    const sourcePort = new StubKnowledgeSourcePort();
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const ingestionPort = new StubKnowledgeIngestionPort();
    const executionLogPort = new StubExecutionLogPort();
    const reindexAll = new ReindexAllKnowledgeUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionLogPort,
    );
    const service = new ReindexKnowledgeUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerType: AIProviderType.OpenAICompatible,
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'plain-secret',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      reindexAll,
      new SyncNoteByIdUseCase(
        sourcePort,
        knowledgeIndexRepository,
        ingestionPort,
        executionLogPort,
      ),
    );

    await service.execute(
      {
        force: true,
        limit: 20,
      },
      {
        requestId: 'req-knowledge-1',
        traceId: 'req-knowledge-1',
        startedAt: 1_700_000_000_000,
        source: 'system',
        identityId: 'identity-1',
      },
    );

    expect(ingestionPort.indexNote).toHaveBeenCalledWith(
      expect.objectContaining({
        providerConfig: expect.objectContaining({
          model: 'gpt-4o-mini',
        }),
      }),
    );
  });

  it('reindexes only the requested saved note and returns its authoritative index result', async () => {
    const sourcePort = new StubKnowledgeSourcePort();
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const ingestionPort = new StubKnowledgeIngestionPort();
    const executionLogPort = new StubExecutionLogPort();
    const reindexAll = new ReindexAllKnowledgeUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionLogPort,
    );
    const syncById = new SyncNoteByIdUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionLogPort,
    );
    const service = new ReindexKnowledgeUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerType: AIProviderType.OpenAICompatible,
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'plain-secret',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      reindexAll,
      syncById,
    );

    const result = await service.execute(
      { resourceIds: ['resource-42'], force: false },
      {
        requestId: 'req-knowledge-1',
        traceId: 'req-knowledge-1',
        startedAt: 1_700_000_000_000,
        source: 'system',
        identityId: 'identity-1',
      },
    );

    expect(sourcePort.getNoteById).toHaveBeenCalledWith('identity-1', 'resource-42');
    expect(sourcePort.listIndexableNotes).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.results).toEqual([
      expect.objectContaining({ resourceId: 'resource-42', status: 'indexed' }),
    ]);
  });

  it('indexes a requested saved note without requiring a configured chat provider', async () => {
    const sourcePort = new StubKnowledgeSourcePort();
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const ingestionPort = new StubKnowledgeIngestionPort();
    const executionLogPort = new StubExecutionLogPort();
    const service = new ReindexKnowledgeUseCase(
      new StubProviderConfigRepository([]) as unknown as IAIProviderConfigRepository,
      new ReindexAllKnowledgeUseCase(
        sourcePort,
        knowledgeIndexRepository,
        ingestionPort,
        executionLogPort,
      ),
      new SyncNoteByIdUseCase(
        sourcePort,
        knowledgeIndexRepository,
        ingestionPort,
        executionLogPort,
      ),
    );

    const result = await service.execute(
      { resourceIds: ['resource-1'] },
      {
        requestId: 'req-knowledge-1',
        traceId: 'req-knowledge-1',
        startedAt: 1_700_000_000_000,
        source: 'system',
        identityId: 'identity-1',
      },
    );

    expect(result.ok).toBe(true);
    expect(ingestionPort.indexNote).toHaveBeenCalledWith(
      expect.objectContaining({ providerConfig: undefined }),
    );
  });
});

describe('AIAnalyticsQueryService', () => {
  it('builds controlled analytics context and delegates the answer generation', async () => {
    const readPort = new StubAnalyticsReadPort();
    const queryPort = new StubAnalyticsQueryPort();
    const executionLogPort = new StubExecutionLogPort();
    const service = new QueryAIAnalyticsUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerType: AIProviderType.OpenAICompatible,
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'plain-secret',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      readPort,
      queryPort,
      executionLogPort,
    );

    const result = await service.queryAnalytics(
      {
        query: 'What needs attention today?',
      } satisfies QueryAnalyticsReq,
      {
        requestId: 'req-knowledge-1',
        traceId: 'req-knowledge-1',
        startedAt: 1_700_000_000_000,
        source: 'system',
        identityId: 'identity-1',
      },
    );

    expect(readPort.buildContext).toHaveBeenCalledWith('identity-1', 'What needs attention today?');
    expect(queryPort.query).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.any(String),
        providerConfig: expect.objectContaining({
          model: 'gpt-4o-mini',
        }),
      }),
    );
    expect(executionLogPort.record).toHaveBeenCalledTimes(1);
    expect(executionLogPort.record).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'ANALYTICS_QUERY',
        status: 'COMPLETED',
        providerId: 'provider-1',
        providerName: 'Main provider',
        model: 'gpt-4o-mini',
        requestId: expect.any(String),
        costEstimate: expect.objectContaining({
          pricingModel: 'gpt-4o-mini',
          totalCostUsd: expect.any(Number),
        }),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.highlights).toEqual(['activeGoals: 4', 'task.overdue: 2']);
    expect(result.data.providerId).toBe('provider-1');
    expect(result.data.tokenUsage.totalTokens).toBe(26);
  });
});

describe('AI knowledge auto-index runtime', () => {
  it('exposes knowledge index diagnostics through AI capabilities', async () => {
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    knowledgeIndexRepository.getDiagnostics.mockResolvedValueOnce({
      persistenceBackend: 'prisma-index-table',
      persistenceStatus: 'enabled',
      vectorRecallBackend: 'pgvector-ivfflat',
      vectorRecallStatus: 'enabled',
    });

    const aiModule = createAIModuleForTests({
      knowledgeSourcePort: new StubKnowledgeSourcePort(),
      knowledgeIndexRepository,
      knowledgeIngestionPort: new StubKnowledgeIngestionPort(),
      knowledgeQueryPort: new StubKnowledgeQueryPort(),
    });

    const capabilities = await aiModule.api.getCapabilities();
    expect(capabilities.ok).toBe(true);
    if (!capabilities.ok) throw new Error('expected ok');
    expect(capabilities.data).toEqual(
      expect.objectContaining({
        supportsKnowledgeQuery: true,
        knowledgeIndexDiagnostics: {
          persistenceBackend: 'prisma-index-table',
          persistenceStatus: 'enabled',
          vectorRecallBackend: 'pgvector-ivfflat',
          vectorRecallStatus: 'enabled',
        },
      }),
    );
  });

});
