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
import type { IGoalRepository } from '@memoflow/goal';
import type { ITaskOccurrenceRepository, ITaskPlanRepository } from '@memoflow/task';
import type { IScheduleRepository } from '@memoflow/schedule';
import type { IScheduleTaskRepository } from '@memoflow/scheduler';
import type { IReminderTemplateRepository } from '@memoflow/reminder';
import type { INotificationRepository } from '@memoflow/notification';
import { createLogger } from '@memoflow/utils/logger';

const logger = createLogger('DashboardReadService');

/**
 * Instance-bound repository dependencies the dashboard read service needs.
 * dashboard 读取服务所需的 instance-bound 仓储依赖。
 *
 * These are the exact Goal/Task/Schedule/Reminder/Notification repository
 * instances owned by the desktop composition root, injected explicitly instead
 * of read through package-level globals. `scheduleTaskRepository` is part of the
 * view so sibling consumers (analytics) share the same instance-bound schedule
 * task repository.
 *
 * 这些是 desktop 组合根拥有的确切 Goal/Task/Schedule/Reminder/Notification 仓储
 * 实例，通过显式注入而非包级全局读取。`scheduleTaskRepository` 属于该视图，使
 * 兄弟消费者（analytics）共享同一个 instance-bound schedule task 仓储。
 */
export interface DashboardReadDependencies {
  readonly goalRepository: IGoalRepository;
  readonly taskPlanRepository: ITaskPlanRepository;
  readonly taskOccurrenceRepository: ITaskOccurrenceRepository;
  readonly scheduleRepository: IScheduleRepository;
  readonly scheduleTaskRepository: IScheduleTaskRepository;
  readonly reminderTemplateRepository: IReminderTemplateRepository;
  readonly notificationRepository: INotificationRepository;
  readonly userTimeContextPort: UserTimeContextPort;
}

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

export async function getDesktopDashboardData(
  identityId: string,
  dependencies: DashboardReadDependencies,
): Promise<DashboardData> {
  const {
    goalRepository,
    taskPlanRepository,
    taskOccurrenceRepository,
    scheduleRepository,
    reminderTemplateRepository,
    notificationRepository,
    userTimeContextPort,
  } = dependencies;
  const timeContext = await userTimeContextPort.getUserTimeContext(identityId);

  const data = await getDashboardData(identityId, {
    listGoals: async (id) =>
      (
        await goalRepository.findByIdentityId(id, {
          includeChildren: true,
          systemView: 'active',
        })
      ).map((goal) => toDashboardGoalRecord(goal.toClientDTO(true))),
    listTaskPlans: async (id) =>
      (await taskPlanRepository.findByIdentityId(id)).map(toTaskPlanRecord),
    listTaskOccurrences: async (id) =>
      (await taskOccurrenceRepository.findByIdentityId(id)).map((instance) =>
        toDashboardTaskOccurrenceRecord(instance.toClientDTOAt(timeContext)),
      ),
    listSchedules: async (id) =>
      (await scheduleRepository.findByIdentityId(id)).map(toScheduleRecord),
    listUpcomingReminders: async (id, beforeTime) =>
      (await reminderTemplateRepository.findByNextTriggerBefore(beforeTime, id)).map(
        toReminderRecord,
      ),
    countUnreadNotifications: (id) => notificationRepository.countUnread(id),
  }, timeContext);

  logger.debug('Dashboard data aggregated', {
    identityId,
    activeGoals: data.stats.activeGoals,
    activeTasks: data.stats.activeTasks,
    completedToday: data.stats.completedToday,
    upcomingReminders: data.stats.upcomingReminders,
    unreadNotifications: data.stats.unreadNotifications,
    scheduleConflicts: data.stats.scheduleConflicts,
  });

  return data;
}
