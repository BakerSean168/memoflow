import type {
  KeyResultCalculationMethod,
  KeyResultMeasurement,
  GoalRecordAggregationSnapshot,
} from '@memoflow/contracts/goal';

export type KeyResultProgressDirection = 'increasing' | 'decreasing';

export interface KeyResultProgressCalculation {
  currentValue: number;
  percentage: number;
  direction: KeyResultProgressDirection;
  isCompleted: boolean;
}

/**
 * Single arithmetic authority for KR Measurement V3.
 *
 * `initialValue` defines user-visible 0% progress. `trackingBaseValue` is only
 * the seed/fallback for authoritative record aggregation and never changes the
 * visible progress baseline.
 */
export function calculateKeyResultProgress(
  measurement: KeyResultMeasurement,
  recordValues?: readonly number[] | GoalRecordAggregationSnapshot,
): KeyResultProgressCalculation {
  validateMeasurement(measurement);
  const currentValue =
    recordValues === undefined
      ? measurement.currentValue
      : aggregateRecords(
          measurement.trackingBaseValue,
          measurement.aggregationMethod,
          Array.isArray(recordValues)
            ? createGoalRecordAggregationSnapshot(recordValues)
            : (recordValues as GoalRecordAggregationSnapshot),
        );

  if (!Number.isFinite(currentValue)) throw new Error('currentValue must be a finite number');

  const span = measurement.targetValue - measurement.initialValue;
  const direction: KeyResultProgressDirection = span > 0 ? 'increasing' : 'decreasing';
  const ratio = (currentValue - measurement.initialValue) / span;
  return {
    currentValue,
    percentage: round(clamp(ratio * 100)),
    direction,
    isCompleted:
      direction === 'increasing'
        ? currentValue >= measurement.targetValue
        : currentValue <= measurement.targetValue,
  };
}

/** Values must be in authoritative chronological order for Last. */
export function createGoalRecordAggregationSnapshot(
  values: readonly number[],
): GoalRecordAggregationSnapshot {
  return values.reduce<GoalRecordAggregationSnapshot>(appendGoalRecordSnapshot, {
    count: 0,
    sum: 0,
    max: null,
    min: null,
    last: null,
  });
}

export function appendGoalRecordSnapshot(
  snapshot: GoalRecordAggregationSnapshot,
  candidate: number,
): GoalRecordAggregationSnapshot {
  if (!Number.isFinite(candidate)) throw new Error('record values must be finite numbers');
  return {
    count: snapshot.count + 1,
    sum: snapshot.sum + candidate,
    max: snapshot.max === null ? candidate : Math.max(snapshot.max, candidate),
    min: snapshot.min === null ? candidate : Math.min(snapshot.min, candidate),
    last: candidate,
  };
}

function aggregateRecords(
  trackingBaseValue: number,
  method: KeyResultCalculationMethod,
  snapshot: GoalRecordAggregationSnapshot,
): number {
  if (method === 'Sum') return trackingBaseValue + snapshot.sum;
  if (snapshot.count === 0) return trackingBaseValue;
  switch (method) {
    case 'Average':
      return snapshot.sum / snapshot.count;
    case 'Max':
      return snapshot.max!;
    case 'Min':
      return snapshot.min!;
    case 'Last':
      return snapshot.last!;
    default:
      return assertNever(method);
  }
}

function validateMeasurement(measurement: KeyResultMeasurement): void {
  for (const [name, value] of [
    ['initialValue', measurement.initialValue],
    ['currentValue', measurement.currentValue],
    ['targetValue', measurement.targetValue],
    ['trackingBaseValue', measurement.trackingBaseValue],
  ] as const) {
    if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
  }
  if (measurement.targetValue === measurement.initialValue) {
    throw new Error('targetValue must differ from initialValue');
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported aggregation method: ${String(value)}`);
}
