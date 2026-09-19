import type { KnowledgeCaptureExecutionFailure } from '@memoflow/contracts/ai';
import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';

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
  readonly draft: import('@memoflow/contracts/ai').KnowledgeDraft;
  readonly context: ExecutionContext;
  readonly priorReceipt?: import('@memoflow/contracts/ai').KnowledgeCaptureExecutionReceipt;
}

export type KnowledgeCaptureExecutionFailureList = KnowledgeCaptureExecutionFailure;
