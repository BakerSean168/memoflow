import type { Instant } from '@memoflow/contracts/primitives';
import type {
  GoalTimeframe,
  KeyResultCalculationMethod,
  KeyResultClientDTO,
  KeyResultServerDTO,
} from '@memoflow/contracts/goal';
import { Entity } from '@memoflow/utils/domain';
import { KeyResultId } from '../../domain';
import { calculateKeyResultProgress } from '../services/key-result-progress-calculator';

export interface KeyResultState {
  id: KeyResultId;
  title: string;
  description: string | null;
  progress: KeyResultServerDTO['progress'];
  target: GoalTimeframe | null;
  weight: number;
  sortOrder: number;
  createdAt: Instant;
  updatedAt: Instant;
}

export class KeyResult extends Entity<KeyResultId> {
  private _props: KeyResultState;

  private constructor(state: KeyResultState) {
    super(state.id);
    this._props = { ...state, progress: { ...state.progress } };
  }

  get title(): string {
    return this._props.title;
  }
  get description(): string | null {
    return this._props.description;
  }
  get progress(): KeyResultServerDTO['progress'] {
    return { ...this._props.progress };
  }
  get target(): GoalTimeframe | null {
    return this._props.target;
  }
  get weight(): number {
    return this._props.weight;
  }
  get sortOrder(): number {
    return this._props.sortOrder;
  }
  get createdAt(): Instant {
    return this._props.createdAt;
  }
  get updatedAt(): Instant {
    return this._props.updatedAt;
  }

  public static load(state: KeyResultState): KeyResult {
    return new KeyResult(state);
  }

  public static create(params: {
    id?: KeyResultId;
    title: string;
    description?: string;
    progress: KeyResultServerDTO['progress'];
    target?: GoalTimeframe | null;
    weight?: number;
    sortOrder?: number;
  }): KeyResult {
    if (!params.title?.trim()) throw new Error('Title is required');
    calculateKeyResultProgress(params.progress);
    const weight = params.weight ?? 3;
    if (!Number.isInteger(weight) || weight < 1 || weight > 5) {
      throw new Error('Weight must be an integer between 1 and 5');
    }
    const now = Date.now();
    return new KeyResult({
      id: params.id ?? KeyResultId.generate(),
      title: params.title.trim(),
      description: params.description?.trim() || null,
      progress: { ...params.progress },
      target: params.target ?? null,
      weight,
      sortOrder: params.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  public updateTitle(title: string): void {
    const trimmed = title.trim();
    if (!trimmed) throw new Error('Title cannot be empty');
    this._props.title = trimmed;
    this.touch();
  }

  public updateDescription(description: string): void {
    this._props.description = description.trim() || null;
    this.touch();
  }

  public updateWeight(weight: number): void {
    if (!Number.isInteger(weight) || weight < 1 || weight > 5) {
      throw new Error('Weight must be an integer between 1 and 5');
    }
    this._props.weight = weight;
    this.touch();
  }

  public updateInitialValue(initialValue: number): void {
    this.replaceProgress({ initialValue });
  }

  public updateTargetValue(targetValue: number): void {
    this.replaceProgress({ targetValue });
  }

  public updateTarget(target: GoalTimeframe | null): void {
    this._props.target = target;
    this.touch();
  }

  public updateUnit(unit?: string | null): void {
    const normalized = unit?.trim() || null;
    if (normalized && normalized.length > 20) throw new Error('Unit too long (max 20 characters)');
    this._props.progress = { ...this._props.progress, unit: normalized };
    this.touch();
  }

  public updateAggregationMethod(aggregationMethod: KeyResultCalculationMethod): void {
    this.replaceProgress({ aggregationMethod });
  }

  /** Atomically updates KR Measurement V3 semantics without rebasing record aggregation. */
  public updateMeasurement(
    patch: Partial<
      Pick<
        KeyResultServerDTO['progress'],
        'initialValue' | 'currentValue' | 'targetValue' | 'aggregationMethod'
      >
    >,
  ): void {
    this.replaceProgress(patch);
  }

  public recalculateProgress(value: number): void {
    this.replaceProgress({ currentValue: value });
  }

  public updateProgress(value: number): void {
    this.recalculateProgress(value);
  }

  public calculatePercentage(): number {
    return calculateKeyResultProgress(this._props.progress).percentage;
  }

  public isCompleted(): boolean {
    return calculateKeyResultProgress(this._props.progress).isCompleted;
  }

  public updateSortOrder(sortOrder: number): void {
    this._props.sortOrder = sortOrder;
    this.touch();
  }

  public toServerDTO(): KeyResultServerDTO {
    return {
      id: this.id,
      title: this._props.title,
      description: this._props.description,
      progress: { ...this._props.progress },
      target: this._props.target,
      weight: this._props.weight,
      sortOrder: this._props.sortOrder,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
    };
  }

  public toClientDTO(): KeyResultClientDTO {
    const calculation = calculateKeyResultProgress(this._props.progress);
    return {
      id: this.id,
      title: this._props.title,
      description: this._props.description,
      progress: {
        initialValue: this._props.progress.initialValue,
        currentValue: this._props.progress.currentValue,
        targetValue: this._props.progress.targetValue,
        aggregationMethod: this._props.progress.aggregationMethod,
        unit: this._props.progress.unit,
      },
      target: this._props.target,
      progressPercentage: calculation.percentage,
      isCompleted: calculation.isCompleted,
      weight: this._props.weight,
      order: this._props.sortOrder,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
    };
  }

  private replaceProgress(patch: Partial<KeyResultServerDTO['progress']>): void {
    const next = { ...this._props.progress, ...patch };
    calculateKeyResultProgress(next);
    this._props.progress = next;
    this.touch();
  }

  private touch(): void {
    this._props.updatedAt = Date.now();
  }
}
