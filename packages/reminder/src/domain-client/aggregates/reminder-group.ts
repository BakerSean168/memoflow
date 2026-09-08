/**
 * ReminderGroup Aggregate Root - Domain Client
 * 提醒分组聚合根 - 领域客户端
 *
 * 【规范说明】
 * - Private constructor with params object
 * - Public getters via this._props.xxx
 * - Static load(state: ReminderGroupState): ReminderGroup
 * - Instance toDTO(): ReminderGroupClientDTO
 */

import type {
  ReminderGroupClientDTO,
  GroupStatsDTO,
  ReminderStatus,
} from '@memoflow/contracts/reminder';
import { AggregateRoot } from '@memoflow/utils/domain';
import { ReminderGroupId } from '../../server/domain/value-objects/reminder-group-id';
import { IdentityId } from '@memoflow/domain-shared';

export interface ReminderGroupState {
  id: ReminderGroupId;
  identityId: IdentityId;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  enabled: boolean;
  status: ReminderStatus;
  order: number;
  stats: GroupStatsDTO;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class ReminderGroup extends AggregateRoot<ReminderGroupId> {
  private readonly _props: ReminderGroupState;

  private constructor(props: ReminderGroupState) {
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

  get description(): string | null {
    return this._props.description;
  }

  get color(): string | null {
    return this._props.color;
  }

  get icon(): string | null {
    return this._props.icon;
  }

  get enabled(): boolean {
    return this._props.enabled;
  }

  get status(): ReminderStatus {
    return this._props.status;
  }

  get order(): number {
    return this._props.order;
  }

  get stats(): GroupStatsDTO {
    return this._props.stats;
  }

  get version(): number {
    return this._props.version;
  }

  get createdAt(): Date {
    return this._props.createdAt;
  }

  get updatedAt(): Date {
    return this._props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this._props.deletedAt;
  }

  // UI 计算属性
  get isDeleted(): boolean {
    return this._props.deletedAt !== null;
  }

  // ================= Factory Methods =================
  public static load(state: ReminderGroupState): ReminderGroup {
    return new ReminderGroup(state);
  }

  // ================= DTO Conversion =================
  public toDTO(): ReminderGroupClientDTO {
    return {
      id: String(this._props.id) as ReminderGroupClientDTO['id'],
      identityId: String(this._props.identityId) as ReminderGroupClientDTO['identityId'],
      name: this._props.name,
      description: this._props.description,
      color: this._props.color,
      icon: this._props.icon,
      enabled: this._props.enabled,
      status: this._props.status,
      order: this._props.order,
      stats: this._props.stats,
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      deletedAt: this._props.deletedAt?.getTime() ?? null,
    };
  }
}
