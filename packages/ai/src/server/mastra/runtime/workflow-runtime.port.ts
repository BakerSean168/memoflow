import type {
  AIWorkflowResumeClientRequest,
  AIWorkflowRunView,
  AIWorkflowStartClientRequest,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';

/**
 * Stable MemoFlow workflow runtime seam.
 *
 * Mastra workflow implementations stay behind this port so HTTP/IPC transports
 * never depend on framework-private snapshots, run handles, or suspend payloads.
 */
export interface AIWorkflowRuntimePort {
  start(input: {
    context: ExecutionContext;
    request: AIWorkflowStartClientRequest;
  }): Promise<AIWorkflowRunView>;
  /** Transport-facing durable dispatch: persist/dispatch, then return a running acknowledgement. */
  startDetached(input: {
    context: ExecutionContext;
    request: AIWorkflowStartClientRequest;
  }): Promise<AIWorkflowRunView>;
  resume(input: {
    context: ExecutionContext;
    request: AIWorkflowResumeClientRequest;
  }): Promise<AIWorkflowRunView>;
  /** Transport-facing durable resume: dispatch the resume without keeping the request open. */
  resumeDetached(input: {
    context: ExecutionContext;
    request: AIWorkflowResumeClientRequest;
  }): Promise<AIWorkflowRunView>;
  get(input: { identityId: string; runId: string }): Promise<AIWorkflowRunView | null>;
  list(input: {
    identityId: string;
    conversationId?: string;
  }): Promise<readonly AIWorkflowRunView[]>;
  cancel(input: { identityId: string; runId: string }): Promise<AIWorkflowRunView | null>;
}
