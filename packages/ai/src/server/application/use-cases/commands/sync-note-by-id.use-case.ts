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
  SyncKnowledgeNoteByIdResult,
} from './ai-knowledge-index-helpers';

/**
 * 按 ID 同步单个知识笔记
 */
export class SyncNoteByIdUseCase {
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
    knowledgeDocumentId: string,
    cx: ExecutionContext,
    options?: SyncKnowledgeNotesOptions,
  ): Promise<SyncKnowledgeNoteByIdResult> {
    const resource = await this.knowledgeSourcePort.getNoteById(cx.identityId, knowledgeDocumentId);
    if (!resource) {
      return {
        note: null,
        sync: null,
      };
    }

    return {
      note: resource,
      sync: await this.syncNotes.execute([resource], cx, {
        ...options,
        force: options?.force ?? true,
      }),
    };
  }
}
