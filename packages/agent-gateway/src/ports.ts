import type {
  TaskReadPlan,
  TaskReadOccurrence,
  TaskPlanReadQuery,
  TaskOccurrenceReadQuery,
  TaskReadPage,
  TaskOccurrenceReadPage,
  TaskAgentPersistedReceipt,
} from '@memoflow/contracts/task';
import type { RoutineAgentPersistedReceipt } from '@memoflow/contracts/routine';
import type { GatewayWriteToolName } from './write-tool-descriptors';
import type { GatewayAssistedToolName } from './assisted-tool-descriptors';
import type { GatewayFailureCode } from '@memoflow/contracts/agent-gateway';
import type  {
  GoalAgentPersistedReceipt,
  GoalClientDTO,
  GoalPage,
  GoalPageQuery,
} from '@memoflow/goal-contracts';
import type { ExecutionContext, RequestContext } from '@memoflow/contracts/shared';

/** Read cancellation stays separate from the canonical ExecutionContext. */
export interface GatewayReadBudget {
  readonly deadlineAt: number;
  readonly signal: AbortSignal;
}
export class GatewayReadError extends Error {
  constructor(readonly code: GatewayFailureCode) {
    super(code);
  }
}

/** Gateway-owned read seam; the API host binds it to Goal's application operations. */
export interface GoalReadPort {
  getGoal(
    id: string,
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<GoalClientDTO | null>;
  searchGoalPage(
    input: GoalPageQuery,
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<GoalPage>;
}
export interface GatewayPrincipal {
  readonly identityId: string;
  readonly credentialId: string;
  readonly credentialType: 'pat' | 'oauth';
  readonly scopes: readonly string[];
}
export interface GatewayCredentialPort {
  authenticate(
    authorization: string | undefined,
    context?: RequestContext,
  ): Promise<GatewayPrincipal | null>;
  consumeReadQuota(credentialId: string, credentialType: 'pat' | 'oauth'): Promise<boolean>;
}
export interface GatewayAuditEvent {
  readonly version: '1';
  readonly effect: 'read' | 'write' | 'credential';
  readonly receiptId?: string;
  readonly replayed?: boolean;
  readonly scopeDecision: 'allowed' | 'denied';
  readonly requestId: string;
  readonly traceId: string;
  readonly credentialId?: string;
  readonly identityId?: string;
  readonly tool:
    | GatewayWriteToolName
    | GatewayAssistedToolName
    | 'goal_get'
    | 'goal_search'
    | 'task_plan_get'
    | 'task_plan_search'
    | 'task_occurrence_get'
    | 'task_occurrence_list'
    | 'transport'
    | 'pat_create'
    | 'pat_list'
    | 'pat_revoke'
    | 'oauth_list'
    | 'oauth_revoke';
  readonly outcome: string;
  readonly durationMs: number;
}

/** Concrete Task owner seam; plan definitions and occurrence facts remain distinct. */
export interface TaskReadPort {
  getTaskPlan(
    id: string,
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<TaskReadPlan | null>;
  searchTaskPlans(
    input: TaskPlanReadQuery,
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<TaskReadPage<TaskReadPlan>>;
  getTaskOccurrence(
    id: string,
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<TaskReadOccurrence | null>;
  listTaskOccurrences(
    input: TaskOccurrenceReadQuery,
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<TaskOccurrenceReadPage>;
}

/** Internal observer only; causes never enter protocol responses or audit payloads. */
export interface GatewayDiagnostic {
  readonly requestId: string;
  readonly traceId: string;
  readonly cause: unknown;
}

export interface GatewayWriteAuthority {
  readonly connectionId: string;
  authorize(): Promise<void>;
  readonly scopes: readonly string[];
}
type WriteCall<T> = (
  input: unknown,
  context: ExecutionContext,
  authority: GatewayWriteAuthority,
) => Promise<T>;
type GoalWriteReceipt = GoalAgentPersistedReceipt & { replayed: boolean };
type TaskWriteReceipt = TaskAgentPersistedReceipt & { replayed: boolean };
/** Only owner application operations cross this boundary; never repositories. */
export interface GatewayWritePort {
  routineCreate?: WriteCall<RoutineAgentPersistedReceipt & { replayed: boolean }>;
  goalCreate: WriteCall<GoalWriteReceipt>;
  goalUpdate: WriteCall<GoalWriteReceipt>;
  keyResultCreate: WriteCall<GoalWriteReceipt>;
  keyResultUpdate: WriteCall<GoalWriteReceipt>;
  taskCreate: WriteCall<TaskWriteReceipt>;
  taskUpdate: WriteCall<TaskWriteReceipt>;
  taskComplete: WriteCall<TaskWriteReceipt>;
}

/** Fully implemented lifecycle is supplied only behind the assisted rollout flag. */
export interface GatewayAssistedPort {
  start: WriteCall<import('@memoflow/contracts/agent-gateway').AssistedView>;
  get: WriteCall<import('@memoflow/contracts/agent-gateway').AssistedView>;
  review: WriteCall<import('@memoflow/contracts/agent-gateway').AssistedView>;
  resume: WriteCall<import('@memoflow/contracts/agent-gateway').AssistedView>;
  cancel: WriteCall<import('@memoflow/contracts/agent-gateway').AssistedView>;
}
