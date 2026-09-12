import type { PrismaClient } from '@memoflow/database';
import {
  getDashboardData,
  toDashboardGoalRecord,
  toDashboardTaskOccurrenceRecord,
  type DashboardTaskPlanRecord,
  type DashboardScheduleRecord,
  type DashboardReminderRecord,
} from '@memoflow/dashboard';
import type { DashboardData } from '@memoflow/contracts/dashboard';
import type { UserTimeContextPort } from '@memoflow/time';
import { createGoalPrismaRepositories } from '@memoflow/goal';
import { createTaskPrismaRepositories } from '@memoflow/task';
import { createSchedulePrismaRepository } from '@memoflow/schedule';
import { createReminderPrismaRepositories } from '@memoflow/reminder';
import { createNotificationPrismaRepositories } from '@memoflow/notification';

/** Soft residual 1156: dual toDashboardTaskOccurrenceRecord retired onto @memoflow/dashboard sole. */

function toTaskPlanRecord(template: {
  id: { toString(): string } | string;
  title: string;
  status: string;
  deletedAt: number | null;
  createdAt: number;
}): DashboardTaskPlanRecord {
  return {
    id: String(template.id),
    title: template.title,
    status: template.status,
    deletedAt: template.deletedAt,
    createdAt: template.createdAt,
  };
}

function toMs(value: Date | number | string | null | undefined): number {
  if (value == null) return Date.now();
  if (typeof value === 'number') return Number.isFinite(value) ? value : Date.now();
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : Date.now();
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function toScheduleRecord(schedule: {
  id: { toString(): string } | string;
  title?: string | null;
  name?: string | null;
  startTime?: number | Date | null;
  endTime?: number | Date | null;
  schedule?: { startDate?: string | null; endDate?: string | null } | null;
  priority?: number | null;
  hasConflict?: boolean;
  createdAt: number | Date;
}): DashboardScheduleRecord {
  const startTime =
    schedule.startTime != null
      ? toMs(schedule.startTime)
      : schedule.schedule?.startDate
        ? toMs(schedule.schedule.startDate)
        : Date.now();
  const endTime =
    schedule.endTime != null
      ? toMs(schedule.endTime)
      : schedule.schedule?.endDate
        ? toMs(schedule.schedule.endDate)
        : startTime;
  return {
    id: String(schedule.id),
    title: schedule.title ?? schedule.name ?? '',
    startTime,
    endTime,
    priority: schedule.priority ?? null,
    hasConflict: schedule.hasConflict ?? false,
    createdAt: toMs(schedule.createdAt),
  };
}

function toReminderRecord(reminder: {
  deletedAt: number | null;
  status: string;
  effectiveEnabled: boolean;
  nextTriggerAt: number | null;
}): DashboardReminderRecord {
  return {
    deletedAt: reminder.deletedAt,
    status: reminder.status,
    effectiveEnabled: reminder.effectiveEnabled,
    nextTriggerAt: reminder.nextTriggerAt,
  };
}

export async function getApiDashboardData(
  db: PrismaClient,
  identityId: string,
  userTimeContextPort: UserTimeContextPort,
): Promise<DashboardData> {
  const goalRepos = createGoalPrismaRepositories(db);
  const taskRepos = createTaskPrismaRepositories(db);
  const scheduleRepository = createSchedulePrismaRepository(db);
  const reminderRepos = createReminderPrismaRepositories(db);
  const notificationRepos = createNotificationPrismaRepositories(db);
  const timeContext = await userTimeContextPort.getUserTimeContext(identityId);

  return getDashboardData(identityId, {
    listGoals: async (id) =>
      (
        await goalRepos.goalRepository.findByIdentityId(id, {
          includeChildren: true,
          systemView: 'active',
        })
      ).map((goal) => toDashboardGoalRecord(goal.toClientDTO(true))),
    listTaskPlans: async (id) =>
      (await taskRepos.taskPlanRepository.findByIdentityId(id)).map(toTaskPlanRecord),
    listTaskOccurrences: async (id) =>
      (await taskRepos.taskOccurrenceRepository.findByIdentityId(id)).map((instance) =>
        toDashboardTaskOccurrenceRecord(instance.toClientDTOAt(timeContext)),
      ),
    listSchedules: async (id) =>
      (await scheduleRepository.findByIdentityId(id)).map(toScheduleRecord),
    listUpcomingReminders: async (id, beforeTime) =>
      (await reminderRepos.reminderTemplateRepository.findByNextTriggerBefore(beforeTime, id)).map(
        toReminderRecord,
      ),
    countUnreadNotifications: (id) => notificationRepos.notificationRepository.countUnread(id),
    // R6：Activity Ledger 窗口查询（避免全量加载后内存拼接）。
    listActivities: async (id, opts = {}) => {
      const limit = opts.limit ?? 10;
      const windowMs = opts.windowMs ?? 14 * 24 * 60 * 60 * 1000;
      const since = new Date(Date.now() - windowMs);
      const rows = await db.activityLedger.findMany({
        where: { identityId: id, occurredAt: { gte: since } },
        orderBy: { occurredAt: 'desc' },
        take: limit,
      });
      return rows.map((row) => ({
        id: row.id,
        type: row.action,
        description: row.title ?? `${row.subjectType}:${row.subjectId}`,
        timestamp: row.occurredAt.getTime(),
      }));
    },
  }, timeContext);
}
