import type {
  TaskReadPlan,
  TaskReadOccurrence,
  TaskPlanReadQuery,
  TaskOccurrenceReadQuery,
  TaskReadPage,
  TaskOccurrenceReadPage,
} from '@memoflow/contracts/task';
import type { GatewayFailureCode } from '@memoflow/contracts/agent-gateway';
import type { GoalClientDTO, GoalPage, GoalPageQuery } from '@memoflow/contracts/goal';
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
  readonly effect: 'read' | 'credential';
  readonly scopeDecision: 'allowed' | 'denied';
  readonly requestId: string;
  readonly traceId: string;
  readonly credentialId?: string;
  readonly identityId?: string;
  readonly tool:
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
