import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  IAIExecutionRecordPort,
  IKnowledgeIndexRepository,
  IKnowledgeIngestionPort,
  IKnowledgeSourcePort,
  KnowledgeSourceNote,
} from '../../ports';
import { SyncKnowledgeNotesUseCase } from './sync-knowledge-notes.use-case';
import {
  mergeUniqueNotes,
  type SyncKnowledgeNotesOptions,
  type SyncKnowledgeNotesResult,
} from './ai-knowledge-index-helpers';

/**
 * 同步相关知识资源
 */
export class SyncRelevantKnowledgeUseCase {
  private readonly syncNotes: SyncKnowledgeNotesUseCase;

  constructor(
    private readonly knowledgeSourcePort: IKnowledgeSourcePort,
    private readonly knowledgeIndexRepository: IKnowledgeIndexRepository,
    knowledgeIngestionPort: IKnowledgeIngestionPort,
    executionRecordPort?: IAIExecutionRecordPort,
  ) {
    this.syncNotes = new SyncKnowledgeNotesUseCase(
      knowledgeIndexRepository,
      knowledgeIngestionPort,
      executionRecordPort,
    );
  }

  async execute(
    query: string,
    limit: number,
    cx: ExecutionContext,
    options?: SyncKnowledgeNotesOptions,
  ): Promise<{
    resources: KnowledgeSourceNote[];
    sync: SyncKnowledgeNotesResult;
  }> {
    const requestedLimit = Math.max(limit, 1);
    const candidateLimit = Math.min(Math.max(requestedLimit * 4, 24), 80);
    const indexedCandidates = await this.knowledgeIndexRepository.findRelevantNotes(
      cx.identityId,
      query,
      candidateLimit,
    );
    const hydratedIndexedNotes = mergeUniqueNotes(
      (
        await Promise.all(
          indexedCandidates.map(async (resource) =>
            this.knowledgeSourcePort.getNoteById(
              cx.identityId,
              resource.knowledgeDocumentId,
              resource.knowledgeSpaceId,
            ),
          ),
        )
      ).filter((resource): resource is KnowledgeSourceNote => resource !== null),
    );
    const relevantNotes =
      hydratedIndexedNotes.length >= Math.min(requestedLimit, 6)
        ? []
        : await this.knowledgeSourcePort.listRelevantNotes(cx.identityId, query, candidateLimit);
    const fallbackNotes =
      hydratedIndexedNotes.length + relevantNotes.length >= Math.min(requestedLimit, 6)
        ? []
        : await this.knowledgeSourcePort.listIndexableNotes(cx.identityId, candidateLimit);
    const resources = mergeUniqueNotes([
      ...hydratedIndexedNotes,
      ...relevantNotes,
      ...fallbackNotes,
    ]).slice(0, candidateLimit);
    const sync = await this.syncNotes.execute(resources, cx, options);
    return {
      resources,
      sync,
    };
  }
}
