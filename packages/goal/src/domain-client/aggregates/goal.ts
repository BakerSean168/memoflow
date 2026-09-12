import type { Instant, Ymd } from '@memoflow/contracts/primitives';
/**
 * Goal Aggregate Root - Domain Client
 * 目标聚合根 - 领域客户端
 *
 * 【规范说明】
 * - Private constructor with props object
 * - Public getters via this._props.xxx
 * - Static load(state: GoalState): Goal
 * - Instance toDTO(): GoalClientDTO
 */

import type { GoalClientDTO, GoalReminderConfig, GoalTimeframe } from '@memoflow/contracts/goal';
import type { LabelDto } from '@memoflow/contracts/label';
import { GoalStatus } from '@memoflow/contracts/goal';
import { AggregateRoot } from '@memoflow/utils/domain';
import { GoalId } from '../../server/domain';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { KeyResult, GoalReview } from '../entities';

export interface GoalState {
  id: GoalId;
  identityId: IdentityId;
  name: string;
  summary: string | null;
  status: GoalStatus;
  startDate: Ymd | null;
  target: GoalTimeframe | null;
  completedAt: Instant | null;
  archivedAt: Instant | null;
  sortOrder: number;
  reminderConfig: GoalReminderConfig | null;
  labels: LabelDto[];
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
  deletedAt: Instant | null;
  keyResults: KeyResult[] | null;
  reviews: GoalReview[] | null;
  totalKeyResults: number;
  completedKeyResults: number;
  overallProgress: number;
}

export class Goal extends AggregateRoot<GoalId> {
  private readonly _props: GoalState;

  private constructor(props: GoalState) {
    super(props.id);
    this._props = props;
  }

  // ================= Getters =================
  get identityId(): IdentityId {
    return this._props.identityId;
  }

  get name(): string {
    return this._props.name;
  }

  get summary(): string | null {
    return this._props.summary;
  }

  get status(): GoalStatus {
    return this._props.status;
  }

  get startDate(): Ymd | null {
    return this._props.startDate;
  }

  get target(): GoalTimeframe | null {
    return this._props.target;
  }

  get completedAt(): Instant | null {
    const v = this._props.completedAt;
    if (v == null) return null;
    return v as Instant;
  }

  get archivedAt(): Instant | null {
    const v = this._props.archivedAt;
    if (v == null) return null;
    return v as Instant;
  }

  get sortOrder(): number {
    return this._props.sortOrder;
  }

  get reminderConfig(): GoalReminderConfig | null {
    return this._props.reminderConfig;
  }

  get labels(): readonly LabelDto[] {
    return [...this._props.labels];
  }

  get version(): number {
    return this._props.version;
  }

  get createdAt(): Instant {
    const v = this._props.createdAt;
    return v as Instant;
  }

  get updatedAt(): Instant {
    const v = this._props.updatedAt;
    return v as Instant;
  }

  get deletedAt(): Instant | null {
    const v = this._props.deletedAt;
    if (v == null) return null;
    return v as Instant;
  }

  get keyResults(): KeyResult[] | null {
    return this._props.keyResults as KeyResult[] | null;
  }

  get reviews(): GoalReview[] | null {
    return this._props.reviews as GoalReview[] | null;
  }

  get isDeleted(): boolean {
    return this._props.deletedAt !== null;
  }

  // ================= Factory Methods =================
  public static load(state: GoalState): Goal {
    return new Goal(state);
  }

  // ================= DTO Conversion =================
  public toDTO(): GoalClientDTO {
    const dto: Omit<GoalClientDTO, 'totalKeyResults' | 'completedKeyResults' | 'overallProgress'> =
      {
        id: String(this._props.id) as GoalClientDTO['id'],
        identityId: String(this._props.identityId) as GoalClientDTO['identityId'],
        name: this._props.name,
        summary: this._props.summary,
        status: this._props.status,
        startDate: this._props.startDate ?? null,
        target: this._props.target ?? null,
        completedAt: this._props.completedAt ?? null,
        archivedAt: this._props.archivedAt ?? null,
        sortOrder: this._props.sortOrder,
        reminderConfig: this._props.reminderConfig ?? null,
        labels: this._props.labels.map((label) => ({ ...label })),
        version: this._props.version,
        createdAt: this._props.createdAt,
        updatedAt: this._props.updatedAt,
        deletedAt: this._props.deletedAt ?? null,
        keyResults: this._props.keyResults?.map((kr) => (kr as KeyResult).toDTO()) ?? null,
        reviews: this._props.reviews?.map((r) => (r as GoalReview).toDTO()) ?? null,
      };

    return {
      ...dto,
      totalKeyResults: this._props.totalKeyResults,
      completedKeyResults: this._props.completedKeyResults,
      overallProgress: this._props.overallProgress,
    } as GoalClientDTO;
  }
}
