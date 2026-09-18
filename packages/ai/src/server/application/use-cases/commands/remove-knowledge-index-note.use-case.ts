import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { IKnowledgeIndexRepository, KnowledgeDocumentIndexRef } from '../../ports';

/** Removes a deleted source resource from the derived AI index. */
export class RemoveKnowledgeIndexNoteUseCase {
  constructor(private readonly knowledgeIndexRepository: IKnowledgeIndexRepository) {}

  async execute(documentRef: KnowledgeDocumentIndexRef, cx: ExecutionContext): Promise<void> {
    await this.knowledgeIndexRepository.removeByDocumentRef(cx.identityId, documentRef);
  }
}
