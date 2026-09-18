import { describe, expect, it, vi } from 'vitest';
import {
  type ExpandKnowledgeReq,
  type QueryAnalyticsReq,
  type QueryKnowledgeReq,
} from '@memoflow/contracts/ai';
import { KnowledgeDocumentRefSchema } from '@memoflow/contracts/repository';

import type { IAIProviderConfigRepository } from '../../../../domain/repositories/i-ai-provider-config-repository';
import type {
  AIExecutionRecordInput,
  AnalyticsQueryContext,
  AnalyticsQueryInput,
  AnalyticsQueryResult,
  IAIExecutionRecordPort,
  IAnalyticsQueryPort,
  IAnalyticsReadPort,
  IKnowledgeIndexRepository,
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

const SPACE_ID = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440011';
const DOC_ID = 'kdoc_550e8400-e29b-41d4-a716-446655440012';
const DOCUMENT_REF = KnowledgeDocumentRefSchema.parse({
  knowledgeSpaceId: SPACE_ID,
  documentId: DOC_ID,
});
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
  createAIProviderSecretVaultStub,
} from '../../../../../testing';

const secretVault = createAIProviderSecretVaultStub();

class StubProviderConfigRepository {
  constructor(
    private readonly providers: Array<{
      id: string;
      identityId: string;
      providerDefinitionId: string;
      baseUrl: string;
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
    return { ...provider, credentialRef: 'credential_test' };
  }

  async findDefaultByIdentityId(identityId: string) {
    const provider =
      this.providers.find((item) => item.identityId === identityId && item.isDefault) ?? null;
    return provider ? { ...provider, credentialRef: 'credential_test' } : null;
  }

  async findByIdentityId(identityId: string) {
    return this.providers
      .filter((provider) => provider.identityId === identityId)
      .map((provider) => ({ ...provider, credentialRef: 'credential_test' }));
  }
}

class StubKnowledgeSourcePort implements IKnowledgeSourcePort {
  public readonly getNoteById = vi.fn<
    (identityId: string, knowledgeDocumentId: string) => Promise<KnowledgeSourceNote | null>
  >(async (identityId, knowledgeDocumentId) => ({
    identityId,
    repositoryId: 'repo-1',
    knowledgeSpaceId: SPACE_ID,
    knowledgeDocumentId,
    sourcePath:
      knowledgeDocumentId === DOC_ID ? 'notes/python-ai.md' : `notes/${knowledgeDocumentId}.md`,
    sourceContentHash: 'hash-1',
    sourceVersion: 'commit-1',
    title: knowledgeDocumentId === DOC_ID ? 'Python AI' : knowledgeDocumentId,
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
      knowledgeSpaceId: SPACE_ID,
      knowledgeDocumentId: DOC_ID,
      sourcePath: 'notes/python-ai.md',
      sourceContentHash: 'hash-1',
      sourceVersion: 'commit-1',
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
    knowledgeSpaceId: input.note.knowledgeSpaceId,
    knowledgeDocumentId: input.note.knowledgeDocumentId ?? DOC_ID,
    sourcePath: input.note.sourcePath,
    sourceContentHash: input.note.sourceContentHash,
    sourceVersion: input.note.sourceVersion,
    title: input.note.title,
    mimeType: input.note.mimeType,
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
        documentRef: DOCUMENT_REF,
        sourcePath: 'notes/python-ai.md',
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
          documentRef: DOCUMENT_REF,
          sourcePath: 'notes/python-ai.md',
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

  public readonly findByDocumentRefs = vi.fn<
    (
      identityId: string,
      documentRefs: Array<{ knowledgeSpaceId: string; knowledgeDocumentId: string }>,
    ) => Promise<KnowledgeIndexedNote[]>
  >(async () => []);

  public readonly findRelevantNotes = vi.fn<
    (identityId: string, query: string, limit: number) => Promise<KnowledgeIndexedNote[]>
  >(async () => []);

  public readonly upsert = vi.fn<(resource: KnowledgeIndexedNote) => Promise<void>>(async () => {});

  public readonly markRequested = vi.fn<
    (
      identityId: string,
      documentRefs: Array<{ knowledgeSpaceId: string; knowledgeDocumentId: string }>,
      requestedAt: number,
    ) => Promise<void>
  >(async () => {});

  public readonly markFailed = vi.fn(async () => {});
  public readonly removeByDocumentRef = vi.fn(async () => {});
}

class StubExecutionLogPort implements IAIExecutionRecordPort {
  public readonly record = vi.fn<(input: AIExecutionRecordInput) => Promise<void>>(async () => {});
}

class StubAnalyticsReadPort implements IAnalyticsReadPort {
  public readonly buildContext = vi.fn<
    (identityId: string, question: string) => Promise<AnalyticsQueryContext>
  >(async () => ({
    timeContext: { timeZone: 'UTC' as never, weekStartsOn: 1 },
    taskDashboard: {
      todayTasks: [],
      overdueTasks: [],
      upcomingTasks: [],
      highPriorityTasks: [],
      summary: { totalTasks: 0, completedToday: 0, overdue: 2, upcoming: 0, highPriority: 0 },
    },
    goals: [],
    goalSearchResults: [],
    ownerReads: {
      goal: { progress: { activeCount: 4, goals: [] } },
      task: { board: { todo: 0, inProgress: 0, done: 0, overdue: 2 } },
      schedule: { upcoming: [], conflictCount: 0 },
      notification: { unreadCount: 0 },
      activity: { recent: [] },
    },
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
  it('records an indexing failure in the AI index without writing Repository projection status', async () => {
    const resource = (await new StubKnowledgeSourcePort().listIndexableNotes('identity-1', 1))[0]!;
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const ingestionPort = new StubKnowledgeIngestionPort();
    ingestionPort.indexNote.mockRejectedValueOnce(new Error('embedding provider unavailable'));
    const service = new SyncKnowledgeNotesUseCase(
      knowledgeIndexRepository,
      ingestionPort,
      new StubExecutionLogPort(),
    );

    const result = await service.execute([resource], { identityId: 'identity-1' });

    expect(result).toEqual(
      expect.objectContaining({
        indexedCount: 0,
        failedCount: 1,
        results: [
          expect.objectContaining({
            knowledgeDocumentId: resource.knowledgeDocumentId,
            status: 'failed',
            error: 'embedding provider unavailable',
          }),
        ],
      }),
    );
    expect(knowledgeIndexRepository.upsert).not.toHaveBeenCalled();
    expect(knowledgeIndexRepository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeDocumentId: resource.knowledgeDocumentId,
        error: 'embedding provider unavailable',
      }),
    );
    expect(knowledgeIndexRepository.markRequested).toHaveBeenCalledWith(
      'identity-1',
      [{ knowledgeSpaceId: SPACE_ID, knowledgeDocumentId: DOC_ID }],
      expect.any(Number),
    );
  });

  it('refreshes the indexed source path on content-hash reuse', async () => {
    const resource = (await new StubKnowledgeSourcePort().listIndexableNotes('identity-1', 1))[0]!;
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    knowledgeIndexRepository.findByDocumentRefs.mockResolvedValueOnce([
      {
        identityId: 'identity-1',
        repositoryId: 'repo-1',
        knowledgeSpaceId: SPACE_ID,
        knowledgeDocumentId: DOC_ID,
        sourcePath: 'notes/old-name.md',
        sourceContentHash: 'hash-1',
        sourceVersion: 'commit-0',
        title: 'Python AI',
        mimeType: 'text/markdown',
        summary: 'cached',
        keywords: [],
        embedding: [],
        chunks: [],
        metadata: {},
      },
    ]);
    const service = new SyncKnowledgeNotesUseCase(
      knowledgeIndexRepository,
      new StubKnowledgeIngestionPort(),
      new StubExecutionLogPort(),
    );

    resource.sourcePath = 'notes/new-name.md';
    const result = await service.execute([resource], { identityId: 'identity-1' });

    expect(result).toMatchObject({ indexedCount: 0, reusedCount: 1, failedCount: 0 });
    expect(knowledgeIndexRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeSpaceId: SPACE_ID,
        knowledgeDocumentId: DOC_ID,
        sourcePath: 'notes/new-name.md',
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
    const executionRecordPort = new StubExecutionLogPort();
    const syncRelevant = new SyncRelevantKnowledgeUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionRecordPort,
    );
    const service = new QueryKnowledgeUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerDefinitionId: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      syncRelevant,
      queryPort,
      executionRecordPort,
      secretVault,
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
    expect(executionRecordPort.record).toHaveBeenCalledTimes(2);
    expect(queryPort.query).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.any(String),
        providerConfig: expect.objectContaining({
          model: 'gpt-4o-mini',
        }),
      }),
    );
    for (const [call] of executionRecordPort.record.mock.calls) {
      expect(call).toEqual(
        expect.objectContaining({
          requestId: expect.any(String),
        }),
      );
    }
    expect(executionRecordPort.record.mock.calls[1]?.[0]).toEqual(
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
    expect(result.data.citations[0]?.sourcePath).toBe('notes/python-ai.md');
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
        knowledgeSpaceId: SPACE_ID,
        knowledgeDocumentId: DOC_ID,
        sourcePath: 'notes/repository-grounding.md',
        sourceContentHash: 'hash-1',
        sourceVersion: 'commit-1',
        title: 'Repository Grounding',
        mimeType: 'text/markdown',
        content: 'Grounded answers cite knowledge notes after retrieval.',
        metadata: {},
      },
    ]);
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const ingestionPort = new StubKnowledgeIngestionPort();
    const queryPort = new StubKnowledgeQueryPort();
    const executionRecordPort = new StubExecutionLogPort();
    const syncRelevant = new SyncRelevantKnowledgeUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionRecordPort,
    );
    const service = new QueryKnowledgeUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerDefinitionId: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      syncRelevant,
      queryPort,
      executionRecordPort,
      secretVault,
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
        knowledgeSpaceId: SPACE_ID,
        knowledgeDocumentId: `kdoc_550e8400-e29b-41d4-a716-4466554400${index + 20}`,
        sourcePath: `notes/resource-${index + 1}.md`,
        title: `Indexed Resource ${index + 1}`,
        mimeType: 'text/markdown',
        sourceContentHash: `hash-${index + 1}`,
        summary: 'Indexed repository grounding guidance.',
        keywords: ['grounding', 'citation'],
        embedding: [0.2, 0.8],
        chunks: [],
        metadata: {},
      })),
    );
    const ingestionPort = new StubKnowledgeIngestionPort();
    const queryPort = new StubKnowledgeQueryPort();
    const executionRecordPort = new StubExecutionLogPort();
    const syncRelevant = new SyncRelevantKnowledgeUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionRecordPort,
    );
    const service = new QueryKnowledgeUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerDefinitionId: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      syncRelevant,
      queryPort,
      executionRecordPort,
      secretVault,
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
    expect(sourcePort.getNoteById).toHaveBeenCalledWith('identity-1', expect.any(String), SPACE_ID);
    expect(sourcePort.listRelevantNotes).not.toHaveBeenCalled();
    expect(sourcePort.listIndexableNotes).not.toHaveBeenCalled();
  });

  it('expands knowledge drafts through the shared retrieval execution port', async () => {
    const sourcePort = new StubKnowledgeSourcePort();
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const ingestionPort = new StubKnowledgeIngestionPort();
    const queryPort = new StubKnowledgeQueryPort();
    const executionRecordPort = new StubExecutionLogPort();
    const syncRelevant = new SyncRelevantKnowledgeUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionRecordPort,
    );
    const service = new ExpandKnowledgeUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerDefinitionId: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      syncRelevant,
      queryPort,
      executionRecordPort,
      secretVault,
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
    expect(result.data.citations[0]?.sourcePath).toBe('notes/python-ai.md');
    expect(result.data.providerId).toBe('provider-1');
    expect(result.data.matchedResourceCount).toBe(1);
  });

  it('reindexes knowledge with the active provider config so batch rebuilds can use provider embeddings', async () => {
    const sourcePort = new StubKnowledgeSourcePort();
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const ingestionPort = new StubKnowledgeIngestionPort();
    const executionRecordPort = new StubExecutionLogPort();
    const reindexAll = new ReindexAllKnowledgeUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionRecordPort,
    );
    const service = new ReindexKnowledgeUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerDefinitionId: 'openai',
          baseUrl: 'https://api.openai.com/v1',
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
        executionRecordPort,
      ),
      secretVault,
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
    const executionRecordPort = new StubExecutionLogPort();
    const reindexAll = new ReindexAllKnowledgeUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionRecordPort,
    );
    const syncById = new SyncNoteByIdUseCase(
      sourcePort,
      knowledgeIndexRepository,
      ingestionPort,
      executionRecordPort,
    );
    const service = new ReindexKnowledgeUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerDefinitionId: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      reindexAll,
      syncById,
      secretVault,
    );

    const result = await service.execute(
      { knowledgeDocumentIds: [DOC_ID], force: false },
      {
        requestId: 'req-knowledge-1',
        traceId: 'req-knowledge-1',
        startedAt: 1_700_000_000_000,
        source: 'system',
        identityId: 'identity-1',
      },
    );

    expect(sourcePort.getNoteById).toHaveBeenCalledWith('identity-1', DOC_ID);
    expect(sourcePort.listIndexableNotes).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.results).toEqual([
      expect.objectContaining({ knowledgeDocumentId: DOC_ID, status: 'indexed' }),
    ]);
  });

  it('indexes a requested saved note without requiring a configured chat provider', async () => {
    const sourcePort = new StubKnowledgeSourcePort();
    const knowledgeIndexRepository = new StubKnowledgeIndexRepository();
    const ingestionPort = new StubKnowledgeIngestionPort();
    const executionRecordPort = new StubExecutionLogPort();
    const service = new ReindexKnowledgeUseCase(
      new StubProviderConfigRepository([]) as unknown as IAIProviderConfigRepository,
      new ReindexAllKnowledgeUseCase(
        sourcePort,
        knowledgeIndexRepository,
        ingestionPort,
        executionRecordPort,
      ),
      new SyncNoteByIdUseCase(
        sourcePort,
        knowledgeIndexRepository,
        ingestionPort,
        executionRecordPort,
      ),
    );

    const result = await service.execute(
      { knowledgeDocumentIds: [DOC_ID] },
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
    const executionRecordPort = new StubExecutionLogPort();
    const service = new QueryAIAnalyticsUseCase(
      new StubProviderConfigRepository([
        {
          id: 'provider-1',
          identityId: 'identity-1',
          providerDefinitionId: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          defaultModel: 'gpt-4o-mini',
          isActive: true,
          isDefault: true,
          name: 'Main provider',
        },
      ]) as unknown as IAIProviderConfigRepository,
      readPort,
      queryPort,
      executionRecordPort,
      secretVault,
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
    expect(executionRecordPort.record).toHaveBeenCalledTimes(1);
    expect(executionRecordPort.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'analytics.query',
        outcome: 'succeeded',
        providerConnectionId: 'provider-1',
        modelId: 'gpt-4o-mini',
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

    const capabilities = await aiModule.providerManagement.getCapabilities();
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
