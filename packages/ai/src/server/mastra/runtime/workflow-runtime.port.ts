import type {
  AIWorkflowResumeClientRequest,
  AIGoalSurfaceLeaseRequest,
  AIGoalSurfaceLeaseResponse,
  AIWorkflowRunView,
  AIWorkflowStartClientRequest,
} from '@memoflow/contracts/ai';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { GoalWorkflowEventSource } from '../../application/ports/goal-workflow-events.port';

/**
 * Stable MemoFlow workflow runtime seam.
 *
 * Mastra workflow implementations stay behind this port so HTTP/IPC transports
 * never depend on framework-private snapshots, run handles, or suspend payloads.
 */
export type ExternalTaskApply = (input: import('../workflows/task-plan-mutation.port').ApplyTaskPlanInput) =>
  Promise<import('@memoflow/contracts/ai').TaskPlanExecutionReceipt>;

export interface ExternalWorkflowInvocation {
  readonly connectionId: string;
  /** Live host capability, re-established on every operation; never persisted as authority. */
  readonly apply: ExternalTaskApply;
}

export interface AIWorkflowRuntimePort {
  goalEvents?(): Promise<GoalWorkflowEventSource | null>;
  start(input: {
    context: ExecutionContext;
    request: AIWorkflowStartClientRequest;
    runId?: string;
    external?: ExternalWorkflowInvocation;
  }): Promise<AIWorkflowRunView>;
  /** Transport-facing durable dispatch: persist/dispatch, then return a running acknowledgement. */
  startDetached(input: {
    context: ExecutionContext;
    request: AIWorkflowStartClientRequest;
    runId?: string;
    external?: ExternalWorkflowInvocation;
  }): Promise<AIWorkflowRunView>;
  resume(input: {
    context: ExecutionContext;
    request: AIWorkflowResumeClientRequest;
    external?: ExternalWorkflowInvocation;
  }): Promise<AIWorkflowRunView>;
  /** Transport-facing durable resume: dispatch the resume without keeping the request open. */
  resumeDetached(input: {
    context: ExecutionContext;
    request: AIWorkflowResumeClientRequest;
    external?: ExternalWorkflowInvocation;
  }): Promise<AIWorkflowRunView>;
  recoverTask?(input: {
    context: ExecutionContext;
    runId: string;
    command?: AIWorkflowResumeClientRequest['command'];
    external: ExternalWorkflowInvocation;
  }): Promise<AIWorkflowRunView>;
  get(input: { identityId: string; runId: string }): Promise<AIWorkflowRunView | null>;
  list(input: {
    identityId: string;
    conversationId?: string;
  }): Promise<readonly AIWorkflowRunView[]>;
  cancel(input: { identityId: string; runId: string }): Promise<AIWorkflowRunView | null>;
  goalSurfaceLease(input: { identityId: string; request: AIGoalSurfaceLeaseRequest }): Promise<AIGoalSurfaceLeaseResponse>;
}
