/**
 * Knowledge note commit service port.
 * 知识笔记提交服务 Port。
 *
 * Narrow application seam that `RepositoryModuleDependencies` consumes instead
 * of the concrete `KnowledgeNoteCommitService` class.
 *
 * `RepositoryModuleDependencies` 消费的窄应用 seam，替代具体
 * `KnowledgeNoteCommitService` 类。
 */

import type { Result } from '@memoflow/contracts/result';
import type {
  CreateConfirmedKnowledgeNoteReq,
  CreateConfirmedKnowledgeNoteResponse,
  AdoptKnowledgeDocumentReq,
  AdoptKnowledgeDocumentResponse,
} from '@memoflow/contracts/repository';

export interface IKnowledgeNoteCommitService {
  create(
    identityId: string,
    input: CreateConfirmedKnowledgeNoteReq,
  ): Promise<Result<CreateConfirmedKnowledgeNoteResponse>>;
  adopt(
    identityId: string,
    input: AdoptKnowledgeDocumentReq,
  ): Promise<Result<AdoptKnowledgeDocumentResponse>>;
}
