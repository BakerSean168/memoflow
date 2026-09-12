import {
  ChecklistItemDefinition,
  CompletionRecord,
  RecurrenceRule,
  TaskGoalBinding,
  TaskGoalBindingTrigger,
  TaskOccurrenceStatus,
  TaskReminderConfig,
  TaskPlanStatus,
  TaskTimeConfig,
  TaskTimeType,
} from '..';
import { DayOfWeek, DependencyType, ReminderTimeUnit } from '@memoflow/contracts/task';

describe('task domain value objects', () => {
  it('covers recurrence rules and reminder configuration', () => {
    const rule = RecurrenceRule.createWeekly(
      [DayOfWeek.Monday, DayOfWeek.Friday],
      2,
    ).setOccurrences(3);
    expect(rule.isWeekly).toBe(true);
    expect(rule.hasEndCondition).toBe(true);
    expect(rule.getDescription()).toContain('周一');
    expect(() =>
      RecurrenceRule.create({
        frequency: 'Weekly',
        interval: 0,
        daysOfWeek: [],
        endDate: null,
        occurrences: null,
      }),
    ).toThrow('Interval must be at least 1');

    const reminders = TaskReminderConfig.createDefault()
      .setEnabled(true)
      .addRelativeTrigger(30, ReminderTimeUnit.Minutes)
      .addAbsoluteTrigger(Date.UTC(2026, 3, 26, 9, 0, 0));
    expect(reminders.isEffective).toBe(true);
    expect(reminders.triggersCount).toBe(2);
  });

  it('covers time config, completion records, and checklist definitions', () => {
    const startDate = new Date('2026-04-26T00:00:00Z');
    const timeConfig = TaskTimeConfig.createTimeRange(startDate, 540, 630);
    expect(timeConfig.isTimeRange).toBe(true);
    expect(timeConfig.getTimeRangeFormatted()).toBe('09:00 - 10:30');
    expect(timeConfig.getDurationMinutes()).toBe(90);
    expect(timeConfig.setTimePoint(null).startDate).toBe(startDate.getTime());
    expect(() =>
      TaskTimeConfig.create({
        timeType: TaskTimeType.TimeRange,
        startDate: startDate.getTime(),
        timePoint: null,
        timeRange: { start: 60, end: 30 },
      }),
    ).toThrow('Time range start must be before end');

    const completion = CompletionRecord.completeWithDuration(90, Date.parse('2026-04-26T10:00:00Z'))
      .setNote('done')
      .setRating(5);
    expect(completion.getDurationFormatted()).toBe('1h 30m');
    expect(completion.isHighRating).toBe(true);

    const items = ChecklistItemDefinition.fromTitles(['A', 'B']);
    expect(items[1].order).toBe(1);
    const originalId = items[0].id;
    expect(items[0].updateTitle('Updated').updateOrder(3).toDTO()).toEqual({
      id: originalId,
      title: 'Updated',
      order: 3,
    });
  });

  it('covers goal binding and status helper objects', () => {
    const binding = TaskGoalBinding.bindToGoal('GoalId_1', 'KeyResultId_1', {
      value: 5,
      trigger: TaskGoalBindingTrigger.PlanCompletion,
    });

    expect(binding.hasContribution).toBe(true);
    expect(binding.getDisplayText()).toContain('PlanCompletion');

    expect(TaskOccurrenceStatus.getAll()).toEqual([
      TaskOccurrenceStatus.Pending,
      TaskOccurrenceStatus.InProgress,
      TaskOccurrenceStatus.Completed,
      TaskOccurrenceStatus.Missed,
      TaskOccurrenceStatus.Skipped,
    ]);
    expect(TaskOccurrenceStatus.isValid('Pending')).toBe(true);
    expect(TaskOccurrenceStatus.isPending(TaskOccurrenceStatus.Pending)).toBe(true);
    expect(TaskOccurrenceStatus.isInProgress(TaskOccurrenceStatus.InProgress)).toBe(true);
    expect(TaskOccurrenceStatus.isCompleted(TaskOccurrenceStatus.Completed)).toBe(true);
    expect(TaskOccurrenceStatus.isSkipped(TaskOccurrenceStatus.Skipped)).toBe(true);
    expect(TaskOccurrenceStatus.isMissed(TaskOccurrenceStatus.Missed)).toBe(true);
    expect(TaskOccurrenceStatus.isTerminated(TaskOccurrenceStatus.Completed)).toBe(true);
    expect(TaskOccurrenceStatus.needsAction(TaskOccurrenceStatus.Pending)).toBe(true);
    expect(TaskPlanStatus.getAll()).toEqual([
      TaskPlanStatus.Active,
      TaskPlanStatus.Paused,
      TaskPlanStatus.Closed,
    ]);
    expect(TaskPlanStatus.of('Active')).toBe(TaskPlanStatus.Active);
    expect(TaskPlanStatus.isValid('Paused')).toBe(true);
    expect(TaskPlanStatus.isActive(TaskPlanStatus.Active)).toBe(true);
    expect(TaskPlanStatus.isPaused(TaskPlanStatus.Paused)).toBe(true);
    expect(TaskPlanStatus.isClosed(TaskPlanStatus.Closed)).toBe(true);
    expect(TaskPlanStatus.isAvailable(TaskPlanStatus.Paused)).toBe(true);
    expect(TaskPlanStatus.isAvailable(TaskPlanStatus.Closed)).toBe(false);
    expect(TaskPlanStatus.isExecutable(TaskPlanStatus.Active)).toBe(true);
    expect(TaskTimeType.getAll()).toEqual([
      TaskTimeType.AllDay,
      TaskTimeType.TimePoint,
      TaskTimeType.TimeRange,
    ]);
    expect(TaskTimeType.of('TimePoint')).toBe(TaskTimeType.TimePoint);
    expect(TaskTimeType.isValid('TimeRange')).toBe(true);
    expect(TaskTimeType.isAllDay(TaskTimeType.AllDay)).toBe(true);
    expect(TaskTimeType.isTimePoint(TaskTimeType.TimePoint)).toBe(true);
    expect(TaskTimeType.isTimeRange(TaskTimeType.TimeRange)).toBe(true);
    expect(TaskTimeType.hasSpecificTime(TaskTimeType.TimePoint)).toBe(true);
    expect(TaskTimeType.hasTimeRange(TaskTimeType.TimeRange)).toBe(true);
    expect(() => TaskOccurrenceStatus.of('Bad')).toThrow('Invalid TaskOccurrenceStatus');
    expect(() => TaskPlanStatus.of('Bad')).toThrow('Invalid TaskPlanStatus');
    expect(() => TaskTimeType.of('Bad')).toThrow('Invalid TaskTimeType');
  });
});
