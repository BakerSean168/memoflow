import type {
  KnowledgeCaptureExecutionFailure,
  KnowledgeCaptureExecutionReceipt,
} from '@memoflow/contracts/ai';
import type { ResultError } from '@memoflow/contracts/result';
import { knowledgeCaptureRequestId } from './deterministic-entity-id';
import type {
  ApplyKnowledgeNoteInput,
  KnowledgeCaptureMutationPort,
} from './knowledge-note-mutation.port';

const RETRYABLE_LEGACY_CODES = new Set([
  'DATABASE_ERROR',
  'DB_ERROR',
  'INTERNAL_ERROR',
  'NETWORK_ERROR',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'TIMEOUT',
]);

function retryableFailure(error: ResultError): boolean {
  const hint = error.failure?.retryHint;
  if (hint?.kind === 'not_retryable') return false;
  if (hint?.kind === 'transient' || hint?.kind === 'after') return true;
  return RETRYABLE_LEGACY_CODES.has(String(error.code).toUpperCase());
}

function failure(
  error: Pick<ResultError, 'code' | 'message' | 'failure'>,
): KnowledgeCaptureExecutionFailure {
  return {
    operation: 'knowledge_note',
    code: String(error.code),
    message: error.message,
    retryable: retryableFailure(error as ResultError),
  };
}

/**
 * Deterministic, restart-safe application of one approved `knowledge.capture`
 * draft.
 *
 * A single knowledge-note write is issued under a stable idempotency request id
 * derived from `(workflowRunId, revision)` (see `knowledgeCaptureRequestId`), so
 * a double-approve / retry replays the same durable write rather than creating a
 * duplicate note. The outbound path stays behind the host-bound
 * `KnowledgeCaptureMutationPort` (which delegates to the canonical
 * knowledge-note persistence application port); the Mastra worker never writes
 * persistence directly.
 */
export class ApplyKnowledgeNoteService {
  constructor(private readonly mutations: KnowledgeCaptureMutationPort) {}

  async apply(input: ApplyKnowledgeNoteInput): Promise<KnowledgeCaptureExecutionReceipt> {
    const { workflowRunId, draft, context } = input;
    const prior =
      input.priorReceipt?.workflowRunId === workflowRunId &&
      input.priorReceipt.revision === draft.revision
        ? input.priorReceipt
        : undefined;

    const requestId = knowledgeCaptureRequestId({ workflowRunId, revision: draft.revision });

    // Idempotency: a prior success for this exact entity is replayed without a
    // second outbound call.
    if (prior?.status === 'success' && prior.noteId) {
      return prior;
    }

    const failures: KnowledgeCaptureExecutionFailure[] = [];
    let noteId: string | undefined = prior?.noteId;
    let notePath: string | undefined = prior?.notePath;
    let noteName: string | undefined = prior?.noteName;

    if (!noteId) {
      const fileName = draft.title.replace(/\.md$/i, '').trim() + '.md';
      const result = await this.mutations.createConfirmedKnowledgeNote({
        workflowRunId,
        revision: draft.revision,
        knowledgeDocumentId: draft.knowledgeDocumentId,
        path: draft.targetSubpath,
        fileName,
        title: draft.title,
        content: draft.markdown,
        requestId,
        context,
      });
      if (result.ok) {
        noteId = result.data.noteId;
        notePath = result.data.notePath;
        noteName = result.data.noteName;
      } else {
        failures.push(failure(result.error));
      }
    }

    return {
      workflowRunId,
      revision: draft.revision,
      status: failures.length ? 'failed' : 'success',
      ...(noteId ? { noteId } : {}),
      ...(notePath ? { notePath } : {}),
      ...(noteName ? { noteName } : {}),
      failures,
      retryable: failures.some((item) => item.retryable),
    };
  }
}
