import type { GoalStatus } from '@memoflow/contracts/goal';

/**
 * Dashboard read-model port interface and record types.
 *
 * These define the contract that any data source must implement
 * to feed the dashboard projection logic.
 *
 * ADR-037: timestamps are Instant (epoch ms), not Date.
 */

export interface DashboardGoalRecord {
  id: string;
  name: string;
  status: GoalStatus;
  deletedAt: number | null;
  updatedAt: number;
  overallProgress: number;
  dueDate: number | null;
  totalKeyResults: number;
}

export interface DashboardTaskPlanRecord {
  id: string;
  title: string;
  status: string;
  deletedAt: number | null;
  createdAt: number;
}

export interface DashboardTaskOccurrenceRecord {
  id: string;
  templateId: string;
  status: string;
  instanceDate: number;
  actualEndTime: number | null;
  updatedAt: number;
  deletedAt: number | null;
  isOverdue(): boolean;
}

export interface DashboardScheduleRecord {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  priority?: number | null;
  hasConflict: boolean;
  createdAt: number;
}

export interface DashboardReminderRecord {
  deletedAt: number | null;
  status: string;
  effectiveEnabled: boolean;
  nextTriggerAt: number | null;
}

/**
 * Port interface for dashboard data sources.
 * Implementations wire this to Prisma (API), PowerSync (Desktop), etc.
 */
export interface DashboardReadSource {
  listGoals(identityId: string): Promise<DashboardGoalRecord[]>;
  listTaskPlans(identityId: string): Promise<DashboardTaskPlanRecord[]>;
  listTaskOccurrences(identityId: string): Promise<DashboardTaskOccurrenceRecord[]>;
  listSchedules(identityId: string): Promise<DashboardScheduleRecord[]>;
  listUpcomingReminders(identityId: string, beforeTime: number): Promise<DashboardReminderRecord[]>;
  countUnreadNotifications(identityId: string): Promise<number>;
  /**
   * R6：Activity Ledger 窗口查询（可选）。提供时 activityTimeline 改从
   * ledger 读，不再全量加载实体后内存拼接；未提供则回退旧派生逻辑。
   */
  listActivities?(
    identityId: string,
    opts?: { limit?: number; windowMs?: number },
  ): Promise<import('@memoflow/contracts/dashboard').ActivityItem[]>;
}
