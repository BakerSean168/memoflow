/**
 * App-local AI host adapter (API lane).
 *
 * Analytics is a read-only composition surface. It consumes explicit owner
 * capabilities and emits an AI context projection; it does not import the
 * Dashboard package or recreate its cross-owner compatibility projection.
 */
import type {
  IAIActivityReadPort,
  IAITaskDashboardReadPort,
  IAIPlannerReadPort,
  IAINotificationReadPort,
  IAnalyticsReadPort,
} from '@memoflow/ai/ports';
import type { GoalApplicationPort } from '@memoflow/goal';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import type { GoalHomeProgressSummary } from '@memoflow/contracts/goal';
import type { UserTimeContextPort } from '@memoflow/time';
import { createTimeFacade } from '@memoflow/time';

const ACTIVITY_WINDOW_DAYS = 14;
const ACTIVITY_LIMIT = 10;
const SCHEDULE_WINDOW_DAYS = 30;
const UPCOMING_SCHEDULE_LIMIT = 5;

const EMPTY_GOAL_PROGRESS: GoalHomeProgressSummary = {
  activeCount: 0,
  goals: [],
};

export interface ControlledAnalyticsReadAdapterDependencies {
  readonly goalApplicationPort: Pick<
    GoalApplicationPort,
    'getHomeSummary' | 'listGoals' | 'searchGoals'
  >;
  readonly taskDashboardReadPort: IAITaskDashboardReadPort;
  readonly plannerReadPort: IAIPlannerReadPort;
  readonly notificationReadPort: IAINotificationReadPort;
  readonly activityReadPort: IAIActivityReadPort;
  readonly userTimeContextPort: UserTimeContextPort;
}

/** Read-only API host composition for AI analytics. */
export class ControlledAnalyticsReadAdapter implements IAnalyticsReadPort {
  constructor(private readonly dependencies: ControlledAnalyticsReadAdapterDependencies) {}

  async buildContext(identityId: string, question: string) {
    const timeContext = await this.dependencies.userTimeContextPort.getUserTimeContext(identityId);
    const time = createTimeFacade({ context: timeContext });
    const now = Number(time.now());
    const scheduleWindowStart = Number(time.calendar.startOfDay(now));
    const scheduleWindowEnd = Number(time.calendar.addDays(now, SCHEDULE_WINDOW_DAYS));
    const activitySince = Number(time.calendar.addDays(now, -ACTIVITY_WINDOW_DAYS));

    const [
      goalProgress,
      goals,
      goalSearchResults,
      taskDashboard,
      planner,
      notifications,
      activity,
    ] = await Promise.all([
      this.dependencies.goalApplicationPort.getHomeSummary(identityId),
      this.dependencies.goalApplicationPort.listGoals({
        identityId: IdentityId.of(identityId),
        systemView: 'active',
        includeKeyResults: true,
        page: 1,
        pageSize: 10,
      }),
      this.dependencies.goalApplicationPort.searchGoals(identityId, question, 'active'),
      this.dependencies.taskDashboardReadPort.getDashboard(identityId),
      this.dependencies.plannerReadPort.getWindowSummary({
        identityId,
        startTime: scheduleWindowStart,
        endTime: scheduleWindowEnd,
      }),
      this.dependencies.notificationReadPort.getUnreadSummary({ identityId, limit: 1 }),
      this.dependencies.activityReadPort.listRecent({
        identityId,
        since: activitySince,
        limit: ACTIVITY_LIMIT,
      }),
    ]);

    const taskBoard = taskDashboard
      ? {
          todo: taskDashboard.todayTasks.filter(
            (task) => task.status === TaskOccurrenceStatus.Pending,
          ).length,
          inProgress: taskDashboard.todayTasks.filter(
            (task) => task.status === TaskOccurrenceStatus.InProgress,
          ).length,
          done: taskDashboard.todayTasks.filter(
            (task) => task.status === TaskOccurrenceStatus.Completed,
          ).length,
          overdue: taskDashboard.overdueTasks.length,
        }
      : { todo: 0, inProgress: 0, done: 0, overdue: 0 };

    const upcomingSchedule = planner.calendar
      .filter((entry) => entry.startTime >= now)
      .sort((left, right) => left.startTime - right.startTime)
      .slice(0, UPCOMING_SCHEDULE_LIMIT)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        startTime: entry.startTime,
        endTime: entry.endTime,
        priority: 0 as const,
      }));

    return {
      timeContext,
      taskDashboard,
      goals: goals.ok ? goals.data.data : [],
      goalSearchResults: goalSearchResults.ok ? goalSearchResults.data.data : [],
      ownerReads: {
        goal: {
          progress: goalProgress.ok ? goalProgress.data : EMPTY_GOAL_PROGRESS,
        },
        task: { board: taskBoard },
        schedule: {
          upcoming: upcomingSchedule,
          conflictCount: planner.calendar.filter((entry) => entry.hasConflict).length,
        },
        notification: { unreadCount: notifications.unreadCount },
        activity: { recent: activity },
      },
      extra: {},
    };
  }
}
