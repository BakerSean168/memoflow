import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GoalReminderConfig,
  GoalStatus,
  KeyResultCalculationMethod,
  KeyResultProgress,
  KeyResultSnapshot,
  KeyResultWeightSnapshot,
  ReminderTriggerType,
} from '..';
import { InvalidWeightError } from '../weight-errors';

describe('goal shared value objects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('covers enum helpers and simple domain errors', () => {
    expect(GoalStatus.getAll()).toEqual([
      GoalStatus.Planned,
      GoalStatus.InProgress,
      GoalStatus.Completed,
      GoalStatus.Abandoned,
    ]);
    expect(GoalStatus.of('Planned')).toBe(GoalStatus.Planned);
    expect(GoalStatus.of('InProgress')).toBe(GoalStatus.InProgress);
    expect(GoalStatus.isPlanned(GoalStatus.Planned)).toBe(true);
    expect(GoalStatus.isInProgress(GoalStatus.InProgress)).toBe(true);
    expect(GoalStatus.isTerminal(GoalStatus.Completed)).toBe(true);
    expect(GoalStatus.isTerminal(GoalStatus.Abandoned)).toBe(true);
    expect(() => GoalStatus.of('Bad')).toThrow('Invalid GoalStatus');

    expect(ReminderTriggerType.getAll()).toEqual([
      ReminderTriggerType.TimeProgressPercentage,
      ReminderTriggerType.RemainingDays,
    ]);
    expect(ReminderTriggerType.of('RemainingDays')).toBe(ReminderTriggerType.RemainingDays);
    expect(ReminderTriggerType.isTimeProgress(ReminderTriggerType.TimeProgressPercentage)).toBe(
      true,
    );
    expect(ReminderTriggerType.isRemainingDays(ReminderTriggerType.RemainingDays)).toBe(true);

    expect(KeyResultCalculationMethod.getAll()).toContain(KeyResultCalculationMethod.Last);
    expect(KeyResultCalculationMethod.of('Sum')).toBe(KeyResultCalculationMethod.Sum);
    expect(KeyResultCalculationMethod.isAggregation(KeyResultCalculationMethod.Average)).toBe(true);
    expect(KeyResultCalculationMethod.isAggregation(KeyResultCalculationMethod.Last)).toBe(false);

    const invalidWeight = new InvalidWeightError('progress', 120);
    expect(invalidWeight.code).toBe('VALIDATION_ERROR');
    expect(invalidWeight.message).toContain('progress');
    expect(invalidWeight.message).toContain('120');
  });

  it('covers reminder config mutations', () => {
    const reminder = GoalReminderConfig.createDefault()
      .setEnabled(true)
      .addTrigger({ type: 'RemainingDays', value: 3, enabled: true })
      .addTrigger({ type: 'TimeProgressPercentage', value: 50, enabled: false });

    expect(reminder.enabled).toBe(true);
    expect(reminder.hasEnabledTriggers).toBe(true);
    expect(reminder.enabledTriggersCount).toBe(1);
    expect(reminder.getEnabledTriggers()).toEqual([
      { type: 'RemainingDays', value: 3, enabled: true },
    ]);
    expect(
      reminder.updateTriggerEnabled('TimeProgressPercentage', 50, true).enabledTriggersCount,
    ).toBe(2);
    expect(reminder.removeTrigger('RemainingDays', 3).triggers).toHaveLength(1);
    expect(reminder.clearTriggers().triggers).toEqual([]);
    expect(GoalReminderConfig.fromDTO(reminder.toDTO()).toDTO()).toEqual(reminder.toDTO());
    expect(() => GoalReminderConfig.create({ enabled: true, triggers: 'bad' as never })).toThrow(
      'Triggers must be an array',
    );
    expect(() =>
      GoalReminderConfig.create({
        enabled: true,
        triggers: Array.from({ length: 11 }, () => ({
          type: 'RemainingDays',
          value: 1,
          enabled: true,
        })),
      }),
    ).toThrow('Too many triggers');
    expect(() =>
      GoalReminderConfig.create({
        enabled: true,
        triggers: [{ type: 'TimeProgressPercentage', value: -1, enabled: true }],
      }),
    ).toThrow('Trigger value must be non-negative');
    expect(() =>
      GoalReminderConfig.create({
        enabled: true,
        triggers: [{ type: 'TimeProgressPercentage', value: 101, enabled: true }],
      }),
    ).toThrow('Trigger value must be between 0-100 for percentage triggers');
  });

  it('covers key result snapshot helpers', () => {
    const snapshot = KeyResultSnapshot.create({
      keyResultId: 'KeyResultId_1' as never,
      title: 'Launch',
      currentValue: 60,
      targetValue: 100,
      progressBaselineValue: null,
      aggregationMethod: 'Sum',
      weight: 3,
      progressPercentage: 60,
    });
    expect(snapshot.isCompleted).toBe(false);
    expect(snapshot.getRemainingValue()).toBe(40);
    expect(snapshot.getProgressLevel()).toBe('in-progress');
    expect(snapshot.getDisplayText()).toContain('Launch: 60/100');
    expect(KeyResultSnapshot.fromDTO(snapshot.toDTO()).toDTO()).toEqual(snapshot.toDTO());
    expect(
      KeyResultSnapshot.create({
        ...snapshot.toDTO(),
        currentValue: 100,
        progressPercentage: 100,
      }).getProgressLevel(),
    ).toBe('completed');
    expect(
      KeyResultSnapshot.create({
        ...snapshot.toDTO(),
        currentValue: 0,
        progressPercentage: 0,
      }).getProgressLevel(),
    ).toBe('not-started');
    expect(() => KeyResultSnapshot.create({ ...snapshot.toDTO(), title: '' })).toThrow(
      'Title cannot be empty',
    );
    expect(() => KeyResultSnapshot.create({ ...snapshot.toDTO(), title: 'x'.repeat(201) })).toThrow(
      'Title too long',
    );
    expect(() =>
      KeyResultSnapshot.create({ ...snapshot.toDTO(), currentValue: Number.NaN }),
    ).toThrow('must be finite');
  });

  it('covers Measurement V2 progress calculation and weight snapshots', () => {
    const progress = KeyResultProgress.create({
      aggregationMethod: 'Sum',
      startingValue: 10,
      currentValue: 40,
      targetValue: 100,
      progressBaselineValue: null,
      unit: 'points',
    });

    expect(progress.increment(5).currentValue).toBe(45);
    expect(progress.decrement(10).currentValue).toBe(30);
    expect(progress.reset().currentValue).toBe(10);
    expect(progress.setToTarget().currentValue).toBe(100);
    expect(progress.calculateAggregatedValue([])).toBe(10);
    expect(progress.calculateAggregatedValue([5, 15])).toBe(30);
    expect(progress.recalculateFromHistory([5, 15]).currentValue).toBe(30);
    expect(progress.getAggregationMethodDescription()).toContain('累计');
    expect(progress.getProgressPercentage()).toBe(40);
    expect(progress.isCompleted).toBe(false);
    expect(progress.getRemainingValue()).toBe(60);
    expect(progress.getCompletedValue()).toBe(40);
    expect(progress.getDirection()).toBe('up');

    for (const [aggregationMethod, expected] of [
      ['Average', 20],
      ['Max', 30],
      ['Min', 10],
      ['Last', 30],
    ] as const) {
      expect(
        KeyResultProgress.create({
          aggregationMethod,
          startingValue: 0,
          currentValue: 0,
          targetValue: 100,
          progressBaselineValue: null,
          unit: null,
        }).calculateAggregatedValue([10, 20, 30]),
      ).toBe(expected);
    }

    const decreasing = KeyResultProgress.create({
      aggregationMethod: 'Last',
      startingValue: 80,
      currentValue: 73,
      targetValue: 70,
      progressBaselineValue: 75,
      unit: 'kg',
    });
    expect(decreasing.getDirection()).toBe('down');
    expect(decreasing.getProgressPercentage()).toBe(40);
    expect(decreasing.isCompleted).toBe(false);
    expect(decreasing.updateCurrentValue(70).isCompleted).toBe(true);
    expect(KeyResultProgress.fromDTO(progress.toDTO()).toDTO()).toEqual(progress.toDTO());
    expect(() =>
      KeyResultProgress.create({
        aggregationMethod: 'Last',
        startingValue: 80,
        currentValue: 73,
        targetValue: 70,
        progressBaselineValue: null,
        unit: 'kg',
      }),
    ).toThrow('progressBaselineValue is required for a decreasing target');
    expect(() =>
      KeyResultProgress.create({
        aggregationMethod: 'Sum',
        startingValue: 0,
        currentValue: 0,
        targetValue: 0,
        progressBaselineValue: null,
        unit: null,
      }),
    ).toThrow('progressBaselineValue is required when targetValue is zero');
    expect(() => KeyResultProgress.create({ ...progress.toDTO(), unit: 'x'.repeat(21) })).toThrow(
      'Unit too long',
    );

    const snapshot = KeyResultWeightSnapshot.create({
      id: 'KeyResultWeightSnapshotId_1' as never,
      goalId: 'GoalId_1' as never,
      keyResultId: 'KeyResultId_1' as never,
      identityId: 'IdentityId_1' as never,
      oldWeight: 2,
      newWeight: 4,
      weightDelta: 2,
      snapshotTime: Date.UTC(2026, 3, 25, 0, 0, 0),
      trigger: 'Manual',
      reason: 'reprioritized',
      operatorId: 'IdentityId_1' as never,
      createdAt: Date.UTC(2026, 3, 25, 0, 5, 0),
    });
    expect(snapshot.isIncreased).toBe(true);
    expect(snapshot.isDecreased).toBe(false);
    expect(snapshot.isUnchanged).toBe(false);
    expect(snapshot.getPercentageChange()).toBe(100);
    expect(snapshot.isManual).toBe(true);
    expect(snapshot.isAuto).toBe(false);
    expect(snapshot.isRestore).toBe(false);
    expect(snapshot.isImport).toBe(false);
    expect(snapshot.hasReason).toBe(true);
    expect(snapshot.getTriggerDisplayText()).toBe('手动调整');
    expect(snapshot.getDisplayText()).toContain('2 → 4');
    expect(snapshot.getAgeInSeconds()).toBe(86100);
    expect(KeyResultWeightSnapshot.fromDTO(snapshot.toDTO()).toDTO()).toEqual(snapshot.toDTO());

    const constructed = new KeyResultWeightSnapshot(
      'KeyResultWeightSnapshotId_2' as never,
      'GoalId_2' as never,
      'KeyResultId_2' as never,
      'IdentityId_2' as never,
      4,
      2,
      Date.UTC(2026, 3, 25, 0, 0, 0),
      'Import',
      'IdentityId_2' as never,
      null,
      Date.UTC(2026, 3, 25, 0, 1, 0),
    );
    expect(constructed.isDecreased).toBe(true);
    expect(constructed.isImport).toBe(true);
    expect(constructed.hasReason).toBe(false);

    expect(() =>
      KeyResultWeightSnapshot.create({
        ...snapshot.toDTO(),
        oldWeight: 0,
      }),
    ).toThrow('Old weight must be an integer between 1-5');
    expect(() =>
      KeyResultWeightSnapshot.create({
        ...snapshot.toDTO(),
        newWeight: 6,
      }),
    ).toThrow('New weight must be an integer between 1-5');
    expect(() =>
      KeyResultWeightSnapshot.create({
        ...snapshot.toDTO(),
        weightDelta: 99,
      }),
    ).toThrow('Weight delta does not match');
    expect(() =>
      KeyResultWeightSnapshot.create({
        ...snapshot.toDTO(),
        snapshotTime: snapshot.createdAt + 1,
      }),
    ).toThrow('Snapshot time must be before or equal to created time');
    expect(() =>
      KeyResultWeightSnapshot.create({
        ...snapshot.toDTO(),
        reason: 'x'.repeat(501),
      }),
    ).toThrow('Reason too long');
  });
});
