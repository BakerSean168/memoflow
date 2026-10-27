import type {
  KnowledgeCaptureExecutionFailure,
  KnowledgeCaptureSource,
} from '@memoflow/ai-contracts';
import type { KnowledgeDocumentId } from '@memoflow/repository-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/transport-contracts';

/**
 * Narrow host binding consumed by the Mastra `knowledge.capture` workflow.
 *
 * Mirrors `GoalPlanMutationPort` / `TaskPlanMutationPort`: the AI package owns
 * orchestration and request mapping; the API/Desktop host binds these calls to
 * the already-composed knowledge-note persistence port. Domain writes stay
 * behind the canonical application port and are never performed directly by the
 * Mastra worker/workflow.
 *
 * `requestId` is the deterministic idempotency key derived from
 * `(workflowRunId, revision)` so a double-approve / retry replays the same
 * durable write rather than creating a duplicate note.
 */
export interface CreateConfirmedKnowledgeNoteResult {
  readonly noteId: KnowledgeDocumentId;
  readonly notePath: string;
  readonly noteName: string;
}

export interface KnowledgeCaptureMutationPort {
  createConfirmedKnowledgeNote(input: {
    readonly workflowRunId: string;
    readonly revision: number;
    readonly knowledgeDocumentId: KnowledgeDocumentId;
    readonly source: KnowledgeCaptureSource;
    /** Vault-relative target subpath (never an absolute Desktop path). */
    readonly path: string;
    readonly fileName: string;
    readonly title: string;
    readonly content: string;
    readonly requestId: string;
    readonly context: ExecutionContext;
  }): Promise<Result<CreateConfirmedKnowledgeNoteResult>>;
}

export interface ApplyKnowledgeNoteInput {
  readonly workflowRunId: string;
  readonly draft: import('@memoflow/ai-contracts').KnowledgeDraft;
  readonly context: ExecutionContext;
  readonly priorReceipt?: import('@memoflow/ai-contracts').KnowledgeCaptureExecutionReceipt;
}

export type KnowledgeCaptureExecutionFailureList = KnowledgeCaptureExecutionFailure;
