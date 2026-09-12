import type { KeyResultCalculationMethod, KeyResultMeasurement } from '@memoflow/contracts/goal';

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
  recordValues?: readonly number[],
): KeyResultProgressCalculation {
  validateMeasurement(measurement);
  const currentValue =
    recordValues === undefined
      ? measurement.currentValue
      : aggregateRecords(
          measurement.trackingBaseValue,
          measurement.aggregationMethod,
          recordValues,
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

function aggregateRecords(
  trackingBaseValue: number,
  method: KeyResultCalculationMethod,
  values: readonly number[],
): number {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('record values must be finite numbers');
  }
  if (method === 'Sum') {
    return trackingBaseValue + values.reduce((sum, value) => sum + value, 0);
  }
  if (values.length === 0) return trackingBaseValue;
  switch (method) {
    case 'Average':
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case 'Max':
      return Math.max(...values);
    case 'Min':
      return Math.min(...values);
    case 'Last':
      return values[values.length - 1];
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
