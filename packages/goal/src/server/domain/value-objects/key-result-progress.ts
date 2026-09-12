import { ValueObject } from '@memoflow/utils/domain';
import type { KeyResultCalculationMethod, KeyResultMeasurement } from '@memoflow/contracts/goal';
import { calculateKeyResultProgress } from '../services/key-result-progress-calculator';

/** Immutable KR Measurement V3 server value object. Arithmetic delegates to the canonical calculator. */
export class KeyResultProgress extends ValueObject<KeyResultMeasurement> {
  private constructor(props: KeyResultMeasurement) {
    super(props);
  }

  public static create(props: KeyResultMeasurement): KeyResultProgress {
    this.validate(props);
    return new KeyResultProgress(props);
  }

  public static createDefault(targetValue: number): KeyResultProgress {
    return this.create({
      initialValue: 0,
      currentValue: 0,
      targetValue,
      trackingBaseValue: 0,
      aggregationMethod: 'Sum',
      unit: null,
    });
  }

  public static fromDTO(dto: KeyResultMeasurement): KeyResultProgress {
    this.validate(dto);
    return new KeyResultProgress(dto);
  }

  private static validate(props: KeyResultMeasurement): void {
    if (props.unit && props.unit.length > 20) throw new Error('Unit too long (max 20 characters)');
    calculateKeyResultProgress(props);
  }

  public get aggregationMethod(): KeyResultCalculationMethod {
    return this.props.aggregationMethod;
  }

  public get initialValue(): number {
    return this.props.initialValue;
  }

  public get targetValue(): number {
    return this.props.targetValue;
  }

  public get currentValue(): number {
    return this.props.currentValue;
  }

  public get trackingBaseValue(): number {
    return this.props.trackingBaseValue;
  }

  public get unit(): string | null {
    return this.props.unit;
  }

  public updateCurrentValue(currentValue: number): KeyResultProgress {
    return KeyResultProgress.create({ ...this.props, currentValue });
  }

  public updateInitialValue(initialValue: number): KeyResultProgress {
    return KeyResultProgress.create({ ...this.props, initialValue });
  }

  public updateTargetValue(targetValue: number): KeyResultProgress {
    return KeyResultProgress.create({ ...this.props, targetValue });
  }

  public updateAggregationMethod(aggregationMethod: KeyResultCalculationMethod): KeyResultProgress {
    return KeyResultProgress.create({ ...this.props, aggregationMethod });
  }

  public increment(delta: number): KeyResultProgress {
    return this.updateCurrentValue(this.props.currentValue + delta);
  }

  public decrement(delta: number): KeyResultProgress {
    return this.updateCurrentValue(this.props.currentValue - delta);
  }

  public reset(): KeyResultProgress {
    return this.updateCurrentValue(this.props.trackingBaseValue);
  }

  public setToTarget(): KeyResultProgress {
    return this.updateCurrentValue(this.props.targetValue);
  }

  public calculateAggregatedValue(values: readonly number[]): number {
    return calculateKeyResultProgress(this.props, values).currentValue;
  }

  public recalculateFromHistory(historyValues: readonly number[]): KeyResultProgress {
    const calculation = calculateKeyResultProgress(this.props, historyValues);
    return new KeyResultProgress({ ...this.props, currentValue: calculation.currentValue });
  }

  public getAggregationMethodDescription(): string {
    const descriptions: Record<KeyResultCalculationMethod, string> = {
      Sum: '累计记录增量',
      Average: '记录样本平均值',
      Max: '记录样本最大值',
      Min: '记录样本最小值',
      Last: '最后一次记录值',
    };
    return descriptions[this.props.aggregationMethod];
  }

  public getProgressPercentage(): number {
    return calculateKeyResultProgress(this.props).percentage;
  }

  public get isCompleted(): boolean {
    return calculateKeyResultProgress(this.props).isCompleted;
  }

  public getRemainingValue(): number {
    return Math.abs(this.props.targetValue - this.props.currentValue);
  }

  public getCompletedValue(): number {
    return Math.abs(this.props.currentValue - this.props.initialValue);
  }

  public getDirection(): 'up' | 'down' {
    return calculateKeyResultProgress(this.props).direction === 'increasing' ? 'up' : 'down';
  }

  public toDTO(): KeyResultMeasurement {
    return { ...this.props };
  }
}
