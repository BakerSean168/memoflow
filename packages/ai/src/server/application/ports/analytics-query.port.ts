import type { UserTimeContext } from '@memoflow/time';
import type { GoalClientDTO, GoalHomeProgressSummary } from '@memoflow/contracts/goal';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { ChatExecutionProviderConfig, ChatExecutionUsage } from './chat-execution.port';
import type { AIActivityItem } from './activity-read.port';

export interface AnalyticsTaskDashboard {
  readonly todayTasks: readonly TaskOccurrenceClientDTO[];
  readonly overdueTasks: readonly TaskOccurrenceClientDTO[];
  readonly upcomingTasks: readonly TaskOccurrenceClientDTO[];
  readonly highPriorityTasks: readonly TaskPlanClientDTO[];
  readonly summary: {
    readonly totalTasks: number;
    readonly completedToday: number;
    readonly overdue: number;
    readonly upcoming: number;
    readonly highPriority: number;
  };
}

/** Read-only Task-owned bounded dashboard projection used by AI analytics. */
export interface IAITaskDashboardReadPort {
  getDashboard(identityId: string): Promise<AnalyticsTaskDashboard | undefined>;
}

export interface AnalyticsTaskBoard {
  readonly todo: number;
  readonly inProgress: number;
  readonly done: number;
  readonly overdue: number;
}

export interface AnalyticsScheduleItem {
  readonly id: string;
  readonly title: string;
  readonly startTime: number;
  readonly endTime: number;
  /** Canonical Schedule vNext has no priority field; retain the old read fact as zero. */
  readonly priority: 0;
}

/**
 * Explicit owner-labelled projections supplied to analytics synthesis.
 * These fields are an AI context shape, not a replacement aggregate/domain.
 */
export interface AnalyticsOwnerReads {
  readonly goal: {
    readonly progress: GoalHomeProgressSummary;
  };
  readonly task: {
    readonly board: AnalyticsTaskBoard;
  };
  readonly schedule: {
    readonly upcoming: readonly AnalyticsScheduleItem[];
    readonly conflictCount: number;
  };
  readonly notification: {
    readonly unreadCount: number;
  };
  readonly activity: {
    readonly recent: readonly AIActivityItem[];
  };
}

export interface AnalyticsQueryContext {
  /** Canonical identity-scoped Product Time context exposed to model synthesis. */
  timeContext: UserTimeContext;
  taskDashboard?: AnalyticsTaskDashboard;
  goals: readonly GoalClientDTO[];
  goalSearchResults: readonly GoalClientDTO[];
  ownerReads: AnalyticsOwnerReads;
  extra: Record<string, unknown>;
}

export interface AnalyticsQueryInput {
  identityId: string;
  providerConfig: ChatExecutionProviderConfig;
  question: string;
  context: AnalyticsQueryContext;
  requestId?: string;
}

export interface AnalyticsQueryResult {
  answer: string;
  highlights: string[];
  usage: ChatExecutionUsage;
}

export interface IAnalyticsQueryPort {
  query(input: AnalyticsQueryInput): Promise<AnalyticsQueryResult>;
}
