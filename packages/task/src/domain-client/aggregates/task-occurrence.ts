import type { Instant } from '@memoflow/contracts/primitives';
/**
 * TaskOccurrence Aggregate Root - Domain Client
 * 任务实例聚合根 - 领域客户端
 *
 * 【规范说明】
 * - Private constructor with params object
 * - Public getters via this._props.xxx
 * - Static load(state: TaskOccurrenceState): TaskOccurrence
 * - Instance toDTO(): TaskOccurrenceClientDTO
 */

import type {
  TaskOccurrenceClientDTO,
  TaskTimeConfig,
  TaskTimeConfigDTO,
  TaskOccurrenceStatus,
} from '@memoflow/contracts/task';
import type { ImportanceLevel } from '@memoflow/contracts/shared';
import { AggregateRoot } from '@memoflow/utils/domain';
import { TaskOccurrenceId } from '../../server/domain/value-objects/task-occurrence-id';
import { TaskPlanId } from '../../server/domain/value-objects/task-plan-id';
import { IdentityId } from '@memoflow/domain-shared';

export interface TaskOccurrenceState {
  id: TaskOccurrenceId;
  templateId: TaskPlanId;
  identityId: IdentityId;
  instanceDate: Instant;
  timeConfig: TaskTimeConfig;
  importance: ImportanceLevel | undefined;
  status: TaskOccurrenceStatus;
  isOverdue: boolean;
  actualStartTime: Instant | null;
  actualEndTime: Instant | null;
  comment: string | null;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
  deletedAt: Instant | null;
}

export class TaskOccurrence extends AggregateRoot<TaskOccurrenceId> {
  // ================= 1. Props =================
  private readonly _props: TaskOccurrenceState;

  // ================= 2. Constructor (Private) =================
  private constructor(props: TaskOccurrenceState) {
    super(props.id);
    this._props = props;
  }

  // ================= 3. Getters =================
  get templateId(): TaskPlanId {
    return this._props.templateId;
  }

  get identityId(): IdentityId {
    return this._props.identityId;
  }

  get instanceDate(): Instant {
    const v = this._props.instanceDate;
    return v as Instant;
  }

  get timeConfig(): TaskTimeConfig {
    return this._props.timeConfig;
  }

  get importance(): ImportanceLevel | undefined {
    return this._props.importance;
  }


  get status(): TaskOccurrenceStatus {
    return this._props.status;
  }

  get isOverdue(): boolean {
    return this._props.isOverdue;
  }

  get actualStartTime(): Instant | null {
    const v = this._props.actualStartTime;
    if (v == null) return null;
    return v as Instant;
  }

  get actualEndTime(): Instant | null {
    const v = this._props.actualEndTime;
    if (v == null) return null;
    return v as Instant;
  }

  get comment(): string | null {
    return this._props.comment;
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

  // UI 计算属性
  get isDeleted(): boolean {
    return this._props.deletedAt !== null;
  }

  get isCompleted(): boolean {
    return this._props.status === 'Completed';
  }

  get isSkipped(): boolean {
    return this._props.status === 'Skipped';
  }

  // ================= 4. Factory Methods =================
  public static load(state: TaskOccurrenceState): TaskOccurrence {
    return new TaskOccurrence(state);
  }

  // ================= 5. DTO Conversion =================
  public toDTO(): TaskOccurrenceClientDTO {
    return {
      id: String(this.id) as TaskOccurrenceClientDTO['id'],
      templateId: String(this._props.templateId) as TaskOccurrenceClientDTO['templateId'],
      identityId: String(this._props.identityId) as TaskOccurrenceClientDTO['identityId'],
      instanceDate: this._props.instanceDate,
      timeConfig: this.serializeTimeConfig(this._props.timeConfig),
      importance: this._props.importance,
      status: this._props.status,
      isOverdue: this._props.isOverdue,
      actualStartTime: this._props.actualStartTime ?? null,
      actualEndTime: this._props.actualEndTime ?? null,
      comment: this._props.comment,
      version: this._props.version,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
      deletedAt: this._props.deletedAt ?? null,
    };
  }

  private serializeTimeConfig(config: TaskTimeConfig): TaskTimeConfigDTO {
    return {
      timeType: config.timeType,
      startDate: config.startDate ? Number(config.startDate) : null,
      timePoint: config.timePoint,
      timeRange: config.timeRange,
    };
  }
}
