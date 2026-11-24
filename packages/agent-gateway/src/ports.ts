import type {
  TaskReadPlan,
  TaskReadOccurrence,
  TaskPlanReadQuery,
  TaskOccurrenceReadQuery,
  TaskReadPage,
  TaskOccurrenceReadPage,
  TaskAgentPersistedReceipt,
} from '@memoflow/task-contracts';
import type {
  RoutineAgentDeleteReceipt,
  RoutineAgentOverrideReceipt,
  RoutineAgentPersistedReceipt,
  RoutineAgentUpdateReceipt,
  RoutineConfigurationSnapshot,
  RoutineUpcomingQuery,
  RoutineUpcomingResponse,
} from '@memoflow/routine-contracts';
import type { GatewayWriteToolName } from './write-tool-descriptors';
import type { GatewayAssistedToolName } from './assisted-tool-descriptors';
import type { GatewayFailureCode, ExternalSchedule } from './contracts';
import type {
  ExternalNotification,
  NotificationMarkReadReceipt,
  NotificationMarkUnreadReceipt,
  NotificationArchiveReceipt,
  NotificationRestoreReceipt,
} from './contracts/notifications';
import type {
  ScheduleWriteReceipt,
  ScheduleRescheduleReceipt,
  ScheduleDeleteReceipt,
} from './contracts/schedule-writes';
import type {
  GoalAgentPersistedReceipt,
  GoalClientDTO,
  GoalPage,
  GoalPageQuery,
} from '@memoflow/goal-contracts';
import type { LabelClientDTO } from '@memoflow/label-contracts';
import type { ExecutionContext, RequestContext } from '@memoflow/transport-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import type { AgentDriverKind } from '@memoflow/ai-contracts';

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

/** Public business-policy refusal; contains no rule ids or tool arguments. */
export class GatewayPermissionDeniedError extends GatewayReadError {
  constructor(readonly decision: 'ask' | 'deny') {
    super('PERMISSION_DENIED');
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
/** Gateway-owned Routine read seam; the API host binds the assembled configuration query port. */
export interface RoutineReadPort {
  getConfigurationSnapshot(
    identityId: string,
    budget?: GatewayReadBudget,
  ): Promise<RoutineConfigurationSnapshot>;
  getUpcomingOccurrences(
    identityId: string,
    query: RoutineUpcomingQuery,
    budget?: GatewayReadBudget,
  ): Promise<RoutineUpcomingResponse>;
}

export interface ScheduleReadPort {
  getSchedule(
    id: string,
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<ExternalSchedule | null>;
  listSchedules(
    query: { startTime: number; endTime: number; limit: number; offset?: number },
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<{ items: readonly ExternalSchedule[]; hasMore: boolean }>;
}

export interface GatewayPrincipal {
  readonly identityId: string;
  readonly credentialId: string;
  readonly credentialType: 'pat' | 'oauth';
  readonly scopes: readonly string[];
  /** OAuth client binding; absent for PAT. */
  readonly clientId?: string;
  /** Consent scopes observed at authentication time; OAuth only. */
  readonly consentScopes?: readonly string[];
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
  readonly credentialType?: 'pat' | 'oauth';
  readonly clientId?: string;
  /** SHA-256 of the sorted consent scopes; never the raw consent document. */
  readonly consentScopesHash?: string;
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
    | 'notification_get'
    | 'notification_list'
    | 'notification_unread_count'
    | 'notification_preferences_get'
    | 'ai_conversation_list'
    | 'ai_conversation_get'
    | 'ai_conversation_transcript'
    | 'ai_agent_list'
    | 'ai_agent_get'
    | 'schedule_get'
    | 'schedule_list'
    | 'routine_get'
    | 'routine_list'
    | 'routine_upcoming'
    | 'label_list'
    | 'label_resolve_names'
    | 'relation_neighbors'
    | 'goal_plan_validate'
    | 'goal_plan_apply'
    | 'workflow_guide_get'
    | 'transport'
    | 'pat_create'
    | 'pat_list'
    | 'pat_revoke'
    | 'oauth_list'
    | 'oauth_revoke'
    | 'oauth_consent_grant'
    | 'oauth_consent_deny';
  readonly outcome: string;
  readonly durationMs: number;
}

/** Relation query with bounds and optional filters. */
export interface RelationNeighborsQuery {
  readonly node: import('./contracts').RelationNodeRef;
  readonly relationType?: import('./contracts').ExternalRelationType;
  readonly targetType?: import('./contracts').RelationNodeType;
  readonly direction?: 'outgoing' | 'incoming' | 'both';
  readonly limit: number;
  readonly offset?: number;
}

export interface RelationNeighborsPage {
  readonly items: readonly import('./contracts').ExternalRelationNeighbor[];
  readonly total?: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string | null;
}

/** Relation owner read seam; provides bounded visibility-filtered cross-domain neighbors. */
export interface RelationReadPort {
  getNeighbors(
    input: RelationNeighborsQuery,
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<RelationNeighborsPage>;
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

/** Gateway-owned read seam; the API host binds it to Label application service operations. */
export interface LabelReadPort {
  list(
    input: { search?: string; limit?: number },
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<LabelClientDTO[]>;
  resolveNames(
    names: readonly string[],
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<LabelClientDTO[]>;
}

/**
 * Gateway-owned Notification read seam. The API host binds it to the domain's
 * `NotificationInboxPort`; the gateway never sees repositories or delivery state.
 */
export interface NotificationReadPort {
  getNotification(
    id: string,
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<ExternalNotification | null>;
  listNotifications(
    query: NotificationReadQuery,
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<NotificationReadPage>;
  getUnreadCount(context: ExecutionContext, budget?: GatewayReadBudget): Promise<number>;
  /** Delivery preferences owned by the credential principal; no identity input crosses. */
  getPreferences(
    context: ExecutionContext,
    budget?: GatewayReadBudget,
  ): Promise<import('./contracts').ExternalNotificationPreferences>;
}
export interface NotificationReadQuery {
  readonly isRead?: boolean;
  readonly category?: string;
  readonly type?: string;
  readonly archiveState: 'active' | 'archived' | 'all';
  readonly keyword?: string;
  readonly page: number;
  readonly limit: number;
}
export interface NotificationReadPage {
  readonly items: readonly ExternalNotification[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

/**
 * Gateway-owned AI read seam; the host binds it to the AI application layer's
 * bounded external projection (#977). The gateway never reaches AI persistence.
 */
export interface GatewayAiConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly status: 'Active' | 'Archived';
  readonly messageCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface GatewayAiConversationAttachment {
  readonly filename: string | null;
  readonly mediaType: string;
  readonly sizeBytes: number | null;
}

export interface GatewayAiConversationMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly truncated: boolean;
  readonly attachments: readonly GatewayAiConversationAttachment[];
  readonly createdAt: number;
}

export interface GatewayAiConversationPage {
  readonly conversations: readonly GatewayAiConversationSummary[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface GatewayAiConversationTranscript {
  readonly conversationId: string;
  readonly messages: readonly GatewayAiConversationMessage[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

export interface AssistantConversationReadPort {
  listConversations(
    cx: ExecutionContext,
    query?: {
      readonly page?: number;
      readonly pageSize?: number;
      readonly status?: 'Active' | 'Archived';
    },
  ): Promise<Result<GatewayAiConversationPage>>;
  readConversation(
    cx: ExecutionContext,
    conversationId: string,
    query?: { readonly page?: number; readonly pageSize?: number },
  ): Promise<Result<GatewayAiConversationTranscript>>;
}

/** Bounded AI Agent archive projection; `get` answers null for missing or foreign ids. */
export interface GatewayAiAgentEntry {
  readonly instanceId: string;
  readonly driver: AgentDriverKind;
  readonly name: string;
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface AgentArchiveReadPort {
  list(cx: ExecutionContext): Promise<readonly GatewayAiAgentEntry[]>;
  get(instanceId: string, cx: ExecutionContext): Promise<GatewayAiAgentEntry | null>;
}

/** Internal observer only; causes never enter protocol responses or audit payloads. */
export interface GatewayDiagnostic {
  readonly requestId: string;
  readonly traceId: string;
  readonly cause: unknown;
}

export interface GatewayWriteAuthority {
  readonly connectionId: string;
  readonly credentialType: 'pat' | 'oauth';
  readonly clientId?: string;
  readonly consentScopesHash?: string;
  authorize(): Promise<void>;
  readonly scopes: readonly string[];
}
type WriteCall<T> = (
  input: unknown,
  context: ExecutionContext,
  authority: GatewayWriteAuthority,
) => Promise<T>;
type GoalWriteReceipt = GoalAgentPersistedReceipt & { replayed?: boolean };
type TaskWriteReceipt = TaskAgentPersistedReceipt & { replayed?: boolean };
type RoutineWriteReceipt = RoutineAgentPersistedReceipt & { replayed?: boolean };
type RoutineUpdateWriteReceipt = RoutineAgentUpdateReceipt & { replayed?: boolean };
type RoutineDeleteWriteReceipt = RoutineAgentDeleteReceipt & { replayed?: boolean };
type RoutineOverrideWriteReceipt = RoutineAgentOverrideReceipt & { replayed?: boolean };
/** Only owner application operations cross this boundary; never repositories. */
export interface GatewayWritePort {
  routineCreate?: WriteCall<RoutineWriteReceipt>;
  routineUpdate?: WriteCall<RoutineUpdateWriteReceipt>;
  routineDelete?: WriteCall<RoutineDeleteWriteReceipt>;
  routinePause?: WriteCall<RoutineOverrideWriteReceipt>;
  routineOverride?: WriteCall<RoutineOverrideWriteReceipt>;
  goalCreate: WriteCall<GoalWriteReceipt>;
  goalUpdate: WriteCall<GoalWriteReceipt>;
  keyResultCreate: WriteCall<GoalWriteReceipt>;
  keyResultUpdate: WriteCall<GoalWriteReceipt>;
  taskCreate: WriteCall<TaskWriteReceipt>;
  taskUpdate: WriteCall<TaskWriteReceipt>;
  taskComplete: WriteCall<TaskWriteReceipt>;
  /** Idempotent read-state transition; no mutation receipt, execute-action stays closed. */
  notificationMarkRead?: WriteCall<NotificationMarkReadReceipt>;
  notificationMarkUnread?: WriteCall<NotificationMarkUnreadReceipt>;
  /** Recoverable archive lifecycle; restore returns the same notification to the active list. */
  notificationArchive?: WriteCall<NotificationArchiveReceipt>;
  notificationRestore?: WriteCall<NotificationRestoreReceipt>;
  /** Delivery preference patch; the owner decides persistence and event fan-out. */
  notificationPreferencesUpdate?: WriteCall<import('./contracts').ExternalNotificationPreferences>;
  /** Calendar entry writes; the owner enforces expectedVersion and version conflict. */
  scheduleCreate?: WriteCall<ScheduleWriteReceipt>;
  scheduleUpdate?: WriteCall<ScheduleWriteReceipt>;
  scheduleReschedule?: WriteCall<ScheduleRescheduleReceipt>;
  scheduleDelete?: WriteCall<ScheduleDeleteReceipt>;
}

/** Fully implemented lifecycle is supplied only behind the assisted rollout flag. */
export interface GatewayAssistedPort {
  start: WriteCall<import('@memoflow/agent-gateway').AssistedView>;
  get: WriteCall<import('@memoflow/agent-gateway').AssistedView>;
  review: WriteCall<import('@memoflow/agent-gateway').AssistedView>;
  resume: WriteCall<import('@memoflow/agent-gateway').AssistedView>;
  cancel: WriteCall<import('@memoflow/agent-gateway').AssistedView>;
}

/** Host binds the common AI permission checkpoint without a Gateway → AI dependency. */
export type GatewayToolCheckpoint = <T>(
  principal: GatewayPrincipal,
  tool: string,
  work: () => Promise<T>,
) => Promise<T>;
