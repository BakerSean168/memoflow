/**
 * ReminderTemplate Aggregate Root - Domain Client
 * 提醒模板聚合根 - 领域客户端
 *
 * 【规范说明】
 * - Private constructor with params object
 * - Public getters via this._props.xxx
 * - Static load(state: ReminderTemplateState): ReminderTemplate
 * - Instance toDTO(): ReminderTemplateClientDTO
 */

import type {
  ReminderTemplateClientDTO,
  TriggerConfigDTO,
  ITriggerConfig,
  ActiveTimeConfigDTO,
  IActiveTimeConfig,
  ActiveHoursConfigDTO,
  IActiveHoursConfig,
  NotificationConfigDTO,
  INotificationConfig,
  ReminderType,
  ReminderStatus,
  RoutineProfileMembershipView,
} from '@memoflow/contracts/reminder';
import type { ImportanceLevel } from '@memoflow/contracts/shared';
import { AggregateRoot } from '@memoflow/utils/domain';
import { ReminderTemplateId } from '../../server/domain/value-objects/reminder-template-id';
import { IdentityId } from '@memoflow/domain-shared';
import { ReminderHistory } from '../entities/reminder-history.js';

export interface ReminderTemplateState {
  id: ReminderTemplateId;
  identityId: IdentityId;
  name: string;
  description: string | null;
  type: ReminderType;
  trigger: ITriggerConfig;
  activeTime: IActiveTimeConfig;
  activeHours: IActiveHoursConfig | null;
  notificationConfig: INotificationConfig;
  selfEnabled: boolean;
  status: ReminderStatus;
  effectiveEnabled: boolean;
  profileMemberships: RoutineProfileMembershipView[];
  importanceLevel: ImportanceLevel;
  tags: string[];
  color: string | null;
  icon: string | null;
  nextTriggerAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  history: ReminderHistory[] | null;
  isActive: boolean;
  isPaused: boolean;
  lifecycleSource: 'global' | 'profile' | 'routine';
  effectiveEnabledReason: string;
  globalReminderEnabled: boolean;
}

export class ReminderTemplate extends AggregateRoot<ReminderTemplateId> {
  private readonly _props: ReminderTemplateState;

  private constructor(props: ReminderTemplateState) {
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

  get type(): ReminderType {
    return this._props.type;
  }

  get trigger(): ITriggerConfig {
    return this._props.trigger;
  }

  get activeTime(): IActiveTimeConfig {
    return this._props.activeTime;
  }

  get activeHours(): IActiveHoursConfig | null {
    return this._props.activeHours;
  }

  get notificationConfig(): INotificationConfig {
    return this._props.notificationConfig;
  }

  get selfEnabled(): boolean {
    return this._props.selfEnabled;
  }

  get status(): ReminderStatus {
    return this._props.status;
  }

  get effectiveEnabled(): boolean {
    return this._props.effectiveEnabled;
  }

  get profileMemberships(): RoutineProfileMembershipView[] {
    return this._props.profileMemberships.map((membership) => ({ ...membership }));
  }

  get importanceLevel(): ImportanceLevel {
    return this._props.importanceLevel;
  }

  get tags(): string[] {
    return [...this._props.tags];
  }

  get color(): string | null {
    return this._props.color;
  }

  get icon(): string | null {
    return this._props.icon;
  }

  get nextTriggerAt(): Date | null {
    return this._props.nextTriggerAt;
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

  get history(): ReminderHistory[] | null {
    return this._props.history ? [...this._props.history] : null;
  }

  // UI 扩展属性
  get isActive(): boolean {
    return this._props.isActive;
  }

  get isPaused(): boolean {
    return this._props.isPaused;
  }

  // UI 计算属性
  get isDeleted(): boolean {
    return this._props.deletedAt !== null;
  }

  // ================= Factory Methods =================
  public static load(state: ReminderTemplateState): ReminderTemplate {
    return new ReminderTemplate(state);
  }

  // ================= DTO Conversion =================
  public toDTO(): ReminderTemplateClientDTO {
    return {
      id: String(this._props.id) as ReminderTemplateClientDTO['id'],
      identityId: String(this._props.identityId) as ReminderTemplateClientDTO['identityId'],
      name: this._props.name,
      description: this._props.description,
      type: this._props.type,
      trigger: this._props.trigger as TriggerConfigDTO,
      activeTime: this._props.activeTime as ActiveTimeConfigDTO,
      activeHours: this._props.activeHours as ActiveHoursConfigDTO | null,
      notificationConfig: this._props.notificationConfig as NotificationConfigDTO,
      selfEnabled: this._props.selfEnabled,
      status: this._props.status,
      effectiveEnabled: this._props.effectiveEnabled,
      profileMemberships: this._props.profileMemberships.map((membership) => ({ ...membership })),
      importanceLevel: this._props.importanceLevel,
      tags: [...this._props.tags],
      color: this._props.color,
      icon: this._props.icon,
      nextTriggerAt: this._props.nextTriggerAt?.getTime() ?? null,
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      deletedAt: this._props.deletedAt?.getTime() ?? null,
      history: this._props.history ? this._props.history.map((h) => h.toDTO()) : null,
      isActive: this._props.isActive,
      isPaused: this._props.isPaused,
      lifecycleSource: this._props.lifecycleSource,
      effectiveEnabledReason: this._props.effectiveEnabledReason,
      globalReminderEnabled: this._props.globalReminderEnabled,
    };
  }
}
