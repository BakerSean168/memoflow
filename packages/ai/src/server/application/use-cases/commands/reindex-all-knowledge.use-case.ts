import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  IAIExecutionRecordPort,
  IKnowledgeIndexRepository,
  IKnowledgeIngestionPort,
  IKnowledgeSourcePort,
} from '../../ports';
import { SyncKnowledgeNotesUseCase } from './sync-knowledge-notes.use-case';
import type {
  SyncKnowledgeNotesOptions,
  SyncKnowledgeNotesResult,
} from './ai-knowledge-index-helpers';

/**
 * 重建全部知识索引
 */
export class ReindexAllKnowledgeUseCase {
  private readonly syncNotes: SyncKnowledgeNotesUseCase;

  constructor(
    private readonly knowledgeSourcePort: IKnowledgeSourcePort,
    knowledgeIndexRepository: IKnowledgeIndexRepository,
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
    cx: ExecutionContext,
    limit = 200,
    options?: SyncKnowledgeNotesOptions,
  ): Promise<SyncKnowledgeNotesResult> {
    const resources = await this.knowledgeSourcePort.listIndexableNotes(cx.identityId, limit);
    return this.syncNotes.execute(resources, cx, {
      ...options,
      force: options?.force ?? true,
    });
  }
}
