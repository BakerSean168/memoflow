import { describe, it, expect } from 'vitest';
import { GoalStatus } from '@memoflow/contracts/goal';
import { TaskOccurrenceStatus, TaskPlanStatus } from '@memoflow/contracts/task';
import { ReminderStatus } from '@memoflow/contracts/reminder';
import { createTimeContext, createTimeFacade } from '@memoflow/time';
import type {
  DashboardReadSource,
  DashboardGoalRecord,
  DashboardTaskPlanRecord,
  DashboardTaskOccurrenceRecord,
  DashboardScheduleRecord,
  DashboardReminderRecord,
} from '../domain/types';
import { getDashboardData } from '../domain/projection';

const TEST_TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });

function makeGoal(overrides: Partial<DashboardGoalRecord> = {}): DashboardGoalRecord {
  return {
    id: 'g1',
    name: 'Goal',
    status: GoalStatus.InProgress,
    deletedAt: null,
    updatedAt: Date.now(),
    overallProgress: 50,
    target: null,
    totalKeyResults: 0,
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<DashboardTaskPlanRecord> = {}): DashboardTaskPlanRecord {
  return {
    id: 't1',
    title: 'Task',
    status: TaskPlanStatus.Active,
    deletedAt: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeInstance(
  overrides: Partial<DashboardTaskOccurrenceRecord> = {},
): DashboardTaskOccurrenceRecord {
  return {
    id: 'i1',
    templateId: 't1',
    status: TaskOccurrenceStatus.Pending,
    instanceDate: Date.now(),
    actualEndTime: null,
    updatedAt: Date.now(),
    deletedAt: null,
    isOverdue: () => false,
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<DashboardScheduleRecord> = {}): DashboardScheduleRecord {
  return {
    id: 's1',
    title: 'Meeting',
    startTime: Date.now() + 3600_000,
    endTime: Date.now() + 7200_000,
    priority: 0,
    hasConflict: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeReminder(overrides: Partial<DashboardReminderRecord> = {}): DashboardReminderRecord {
  return {
    deletedAt: null,
    status: ReminderStatus.Active,
    effectiveEnabled: true,
    nextTriggerAt: Date.now() + 3600_000,
    ...overrides,
  };
}

function makeSource(overrides: Partial<DashboardReadSource> = {}): DashboardReadSource {
  return {
    listGoals: async () => [],
    listTaskPlans: async () => [],
    listTaskOccurrences: async () => [],
    listSchedules: async () => [],
    listUpcomingReminders: async () => [],
    countUnreadNotifications: async () => 0,
    ...overrides,
  };
}

describe('getDashboardData', () => {
  it('returns empty dashboard with default source', async () => {
    const data = await getDashboardData('user1', makeSource(), TEST_TIME_CONTEXT);

    expect(data.stats.activeTasks).toBe(0);
    expect(data.stats.completedToday).toBe(0);
    expect(data.stats.activeGoals).toBe(0);
    expect(data.stats.upcomingReminders).toBe(0);
    expect(data.stats.unreadNotifications).toBe(0);
    expect(data.goalProgress).toEqual([]);
    expect(data.taskBoard).toEqual({ todo: 0, inProgress: 0, done: 0, overdue: 0 });
    expect(data.upcomingSchedule).toEqual([]);
  });

  it('counts Planned and InProgress goals as the non-terminal active summary', async () => {
    const source = makeSource({
      listGoals: async () => [
        makeGoal({ id: 'g1', status: GoalStatus.Planned }),
        makeGoal({ id: 'g2', status: GoalStatus.Completed }),
        makeGoal({ id: 'g3', status: GoalStatus.InProgress, deletedAt: Date.now() }),
        makeGoal({ id: 'g4', status: GoalStatus.InProgress }),
        makeGoal({ id: 'g5', status: GoalStatus.Abandoned }),
      ],
    });

    const data = await getDashboardData('user1', source, TEST_TIME_CONTEXT);
    expect(data.stats.activeGoals).toBe(2);
    expect(data.goalProgress).toHaveLength(2);
  });

  it('counts unread notifications', async () => {
    const source = makeSource({
      countUnreadNotifications: async () => 5,
    });

    const data = await getDashboardData('user1', source, TEST_TIME_CONTEXT);
    expect(data.stats.unreadNotifications).toBe(5);
  });

  it('sorts goalProgress by recency after Goal priority retirement', async () => {
    const now = Date.now();
    const source = makeSource({
      listGoals: async () => [
        makeGoal({ id: 'g1', updatedAt: now - 1000 }),
        makeGoal({ id: 'g2', updatedAt: now - 2000 }),
        makeGoal({ id: 'g3', updatedAt: now }),
      ],
    });

    const data = await getDashboardData('user1', source, TEST_TIME_CONTEXT);
    expect(data.goalProgress.map((item) => item.id)).toEqual(['g3', 'g1', 'g2']);
  });

  it('limits goalProgress to 5 items', async () => {
    const goals = Array.from({ length: 8 }, (_, i) => makeGoal({ id: `g${i}`, updatedAt: i }));
    const source = makeSource({
      listGoals: async () => goals,
    });

    const data = await getDashboardData('user1', source, TEST_TIME_CONTEXT);
    expect(data.goalProgress).toHaveLength(5);
  });

  it('clamps goal progress to 0-100 range', async () => {
    const source = makeSource({
      listGoals: async () => [
        makeGoal({ id: 'g1', overallProgress: -10 }),
        makeGoal({ id: 'g2', overallProgress: 150 }),
        makeGoal({ id: 'g3', overallProgress: NaN }),
      ],
    });

    const data = await getDashboardData('user1', source, TEST_TIME_CONTEXT);
    const progressById = Object.fromEntries(
      data.goalProgress.map((goal) => [goal.id, goal.progress]),
    );

    expect(progressById.g1).toBe(0);
    expect(progressById.g2).toBe(100);
    expect(progressById.g3).toBe(0);
  });

  it('filters out closed and deleted task plans', async () => {
    const source = makeSource({
      listTaskPlans: async () => [
        makeTemplate({ id: 't1', status: TaskPlanStatus.Active }),
        makeTemplate({ id: 't2', status: TaskPlanStatus.Paused }),
        makeTemplate({ id: 't3', deletedAt: Date.now() }),
        makeTemplate({ id: 't4', status: TaskPlanStatus.Closed }),
      ],
    });

    const data = await getDashboardData('user1', source, TEST_TIME_CONTEXT);
    expect(data.taskBoard.todo).toBe(0);
  });

  it('builds taskBoard from today instances', async () => {
    const time = createTimeFacade({ context: TEST_TIME_CONTEXT });
    const todayMs = Number(time.calendar.startOfDay(time.now()));

    const source = makeSource({
      listTaskOccurrences: async () => [
        makeInstance({
          id: 'i1',
          status: TaskOccurrenceStatus.Pending,
          instanceDate: todayMs + 1000,
        }),
        makeInstance({
          id: 'i2',
          status: TaskOccurrenceStatus.InProgress,
          instanceDate: todayMs + 2000,
        }),
        makeInstance({
          id: 'i3',
          status: TaskOccurrenceStatus.Completed,
          instanceDate: todayMs + 3000,
        }),
        makeInstance({
          id: 'i4',
          status: TaskOccurrenceStatus.Pending,
          instanceDate: todayMs + 4000,
        }),
      ],
    });

    const data = await getDashboardData('user1', source, TEST_TIME_CONTEXT);
    expect(data.taskBoard.todo).toBe(2);
    expect(data.taskBoard.inProgress).toBe(1);
    expect(data.taskBoard.done).toBe(1);
  });

  it('counts overdue tasks', async () => {
    const source = makeSource({
      listTaskOccurrences: async () => [
        makeInstance({ id: 'i1', status: TaskOccurrenceStatus.Missed, isOverdue: () => false }),
        makeInstance({ id: 'i2', status: TaskOccurrenceStatus.Pending, isOverdue: () => true }),
        makeInstance({ id: 'i3', status: TaskOccurrenceStatus.Pending, isOverdue: () => false }),
      ],
    });

    const data = await getDashboardData('user1', source, TEST_TIME_CONTEXT);
    expect(data.taskBoard.overdue).toBe(1);
  });

  it('filters upcoming schedules', async () => {
    const now = Date.now();
    const source = makeSource({
      listSchedules: async () => [
        makeSchedule({ id: 's1', startTime: now + 3600_000, endTime: now + 7200_000 }),
        makeSchedule({ id: 's2', startTime: now - 3600_000, endTime: now - 1800_000 }), // past
      ],
    });

    const data = await getDashboardData('user1', source, TEST_TIME_CONTEXT);
    expect(data.upcomingSchedule).toHaveLength(1);
    expect(data.upcomingSchedule[0].id).toBe('s1');
  });

  it('counts schedule conflicts', async () => {
    const now = Date.now();
    const source = makeSource({
      listSchedules: async () => [
        makeSchedule({ id: 's1', hasConflict: true, endTime: now + 7200_000 }),
        makeSchedule({ id: 's2', hasConflict: false, endTime: now + 7200_000 }),
        makeSchedule({ id: 's3', hasConflict: true, endTime: now + 7200_000 }),
      ],
    });

    const data = await getDashboardData('user1', source, TEST_TIME_CONTEXT);
    expect(data.stats.scheduleConflicts).toBe(2);
  });

  it('filters upcoming reminders correctly', async () => {
    const now = Date.now();
    const source = makeSource({
      listUpcomingReminders: async () => [
        makeReminder({ nextTriggerAt: now + 3600_000 }),
        makeReminder({ nextTriggerAt: null }),
        makeReminder({ deletedAt: Date.now() }),
        makeReminder({ status: ReminderStatus.Paused }),
        makeReminder({ effectiveEnabled: false }),
      ],
    });

    const data = await getDashboardData('user1', source, TEST_TIME_CONTEXT);
    expect(data.stats.upcomingReminders).toBe(1);
  });
});
