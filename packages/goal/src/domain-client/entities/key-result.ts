import type { Instant } from '@memoflow/contracts/primitives';
/**
 * KeyResult Entity - Domain Client
 * 关键成果实体 - 领域客户端
 *
 * 【规范说明】
 * - Private constructor with props object
 * - Public getters via this._props.xxx
 * - Static load(state: KeyResultState): KeyResult
 * - Instance toDTO(): KeyResultClientDTO
 */

import type {
  GoalTimeframe,
  KeyResultClientDTO,
  KeyResultProgress,
} from '@memoflow/contracts/goal';
import { Entity } from '@memoflow/utils/domain';
import { KeyResultId } from '../../server/domain';

export interface KeyResultState {
  id: KeyResultId;
  title: string;
  description: string | null;
  progress: KeyResultProgress;
  target: GoalTimeframe | null;
  progressPercentage: number;
  isCompleted: boolean;
  weight: number;
  order: number;
  createdAt: Instant;
  updatedAt: Instant;
}

export class KeyResult extends Entity<KeyResultId> {
  // ================= 1. Props =================
  private readonly _props: KeyResultState;

  // ================= 2. Constructor (Private) =================
  private constructor(props: KeyResultState) {
    super(props.id);
    this._props = props;
  }

  // ================= 3. Getters =================
  get title(): string {
    return this._props.title;
  }

  get description(): string | null {
    return this._props.description;
  }

  get progress(): KeyResultProgress {
    return this._props.progress;
  }

  get target(): GoalTimeframe | null {
    return this._props.target;
  }

  get weight(): number {
    return this._props.weight;
  }

  get order(): number {
    return this._props.order;
  }

  get createdAt(): Instant {
    const v = this._props.createdAt;
    return v as Instant;
  }

  get updatedAt(): Instant {
    const v = this._props.updatedAt;
    return v as Instant;
  }

  get progressPercentage(): number {
    return this._props.progressPercentage;
  }

  get isCompleted(): boolean {
    return this._props.isCompleted;
  }

  // ================= 4. Factory Methods =================
  public static load(state: KeyResultState): KeyResult {
    return new KeyResult(state);
  }

  // ================= 5. DTO Conversion =================
  public toDTO(): KeyResultClientDTO {
    return {
      id: this.id as KeyResultId,
      title: this._props.title,
      description: this._props.description,
      progress: { ...this._props.progress },
      target: this._props.target,
      progressPercentage: this._props.progressPercentage,
      isCompleted: this._props.isCompleted,
      weight: this._props.weight,
      order: this._props.order,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
    };
  }
}
