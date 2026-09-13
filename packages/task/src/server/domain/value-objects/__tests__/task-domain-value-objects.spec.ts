import {
  ChecklistItemDefinition,
  TaskGoalBinding,
  TaskGoalBindingTrigger,
  TaskOccurrenceStatus,
  TaskPlanSchedule,
  TaskReminderConfig,
  TaskPlanStatus,
} from '..';
import {
  DayOfWeek,
  ReminderTimeUnit,
  TaskOccurrenceResultSchema,
  TaskPlanScheduleKind,
} from '@memoflow/contracts/task';

describe('task domain value objects', () => {
  it('covers canonical task plan schedules and reminder configuration', () => {
    const schedule = TaskPlanSchedule.create({
      kind: TaskPlanScheduleKind.Recurring,
      startDate: '2026-04-26',
      timing: { kind: 'Window', start: '09:00', end: '10:30' },
      recurrence: {
        frequency: 'Weekly',
        interval: 2,
        byWeekday: [DayOfWeek.Monday, DayOfWeek.Friday],
        end: { kind: 'Count', count: 3 },
      },
    });
    expect(schedule.isRecurring).toBe(true);
    expect(schedule.calendarDate).toBe('2026-04-26');
    expect(schedule.timing).toEqual({ kind: 'Window', start: '09:00', end: '10:30' });
    expect(schedule.recurrence?.end).toEqual({ kind: 'Count', count: 3 });
    expect(() =>
      TaskPlanSchedule.create({
        kind: TaskPlanScheduleKind.OneTime,
        date: '2026-04-26',
        timing: { kind: 'Window', start: '10:30', end: '09:00' },
      }),
    ).toThrow('Task timing window end must be after start');

    const reminders = TaskReminderConfig.createDefault()
      .setEnabled(true)
      .addRelativeTrigger(30, ReminderTimeUnit.Minutes)
      .addAbsoluteTrigger(Date.UTC(2026, 3, 26, 9, 0, 0));
    expect(reminders.isEffective).toBe(true);
    expect(reminders.triggersCount).toBe(2);
  });

  it('covers canonical occurrence results and checklist definitions', () => {
    const completion = TaskOccurrenceResultSchema.parse({
      kind: 'Completed',
      recordedAt: Date.parse('2026-04-26T10:00:00Z'),
      actualDurationMinutes: 90,
      note: 'done',
      rating: 5,
    });
    expect(completion).toMatchObject({ kind: 'Completed', actualDurationMinutes: 90 });

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
    expect(() => TaskOccurrenceStatus.of('Bad')).toThrow('Invalid TaskOccurrenceStatus');
    expect(() => TaskPlanStatus.of('Bad')).toThrow('Invalid TaskPlanStatus');
  });
});
