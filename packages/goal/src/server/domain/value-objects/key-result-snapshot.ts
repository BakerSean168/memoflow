import { ValueObject } from '@memoflow/utils/domain';
import type {
  KeyResultCalculationMethod,
  KeyResultSnapshot as IKeyResultSnapshot,
  KeyResultSnapshotDTO,
} from '@memoflow/contracts/goal';
import type { KeyResultId } from '@memoflow/contracts/primitives';

/** Immutable authoritative KR measurement snapshot used by Goal Review. */
export class KeyResultSnapshot
  extends ValueObject<KeyResultSnapshotDTO>
  implements IKeyResultSnapshot
{
  private constructor(props: KeyResultSnapshotDTO) {
    super(props);
  }

  public static create(props: KeyResultSnapshotDTO): KeyResultSnapshot {
    this.validate(props);
    return new KeyResultSnapshot(props);
  }

  public static fromDTO(dto: KeyResultSnapshotDTO): KeyResultSnapshot {
    this.validate(dto);
    return new KeyResultSnapshot(dto);
  }

  private static validate(props: KeyResultSnapshotDTO): void {
    if (!props.title?.trim()) throw new Error('Title cannot be empty');
    if (props.title.length > 200) throw new Error('Title too long (max 200 characters)');
    if (props.progressPercentage < 0 || props.progressPercentage > 100) {
      throw new Error('Progress percentage must be between 0-100');
    }
    for (const value of [props.initialValue, props.currentValue, props.targetValue]) {
      if (!Number.isFinite(value)) throw new Error('Snapshot measurement values must be finite');
    }
    if (!Number.isInteger(props.weight) || props.weight < 1 || props.weight > 5) {
      throw new Error('Snapshot weight must be an integer between 1 and 5');
    }
  }

  public get keyResultId(): KeyResultId {
    return this.props.keyResultId;
  }
  public get title(): string {
    return this.props.title;
  }
  public get currentValue(): number {
    return this.props.currentValue;
  }
  public get targetValue(): number {
    return this.props.targetValue;
  }
  public get initialValue(): number {
    return this.props.initialValue;
  }
  public get aggregationMethod(): KeyResultCalculationMethod {
    return this.props.aggregationMethod;
  }
  public get weight(): number {
    return this.props.weight;
  }
  public get progressPercentage(): number {
    return this.props.progressPercentage;
  }
  public get isCompleted(): boolean {
    return this.props.progressPercentage >= 100;
  }
  public getRemainingValue(): number {
    return Math.abs(this.props.targetValue - this.props.currentValue);
  }
  public getProgressLevel(): 'not-started' | 'in-progress' | 'completed' {
    if (this.props.progressPercentage === 0) return 'not-started';
    if (this.props.progressPercentage >= 100) return 'completed';
    return 'in-progress';
  }
  public getDisplayText(): string {
    return `${this.props.title}: ${this.props.currentValue}/${this.props.targetValue} (${Math.round(this.props.progressPercentage)}%)`;
  }
  public toDTO(): KeyResultSnapshotDTO {
    return { ...this.props };
  }
}
