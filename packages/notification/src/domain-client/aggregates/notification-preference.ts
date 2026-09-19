import type {
  NotificationPreferenceClientDTO,
  NotificationChannelType,
  QuietHoursDTO,
} from '@memoflow/contracts/notification';
import { AggregateRoot } from '@memoflow/utils/domain';
import { NotificationPreferenceId } from '../../server/domain/value-objects/notification-preference-id';
import { IdentityId } from '@memoflow/domain-shared';
import type {
  NotificationPreferenceId as NotificationPreferenceIdBranded,
  IdentityId as IdentityIdBranded,
} from '@memoflow/contracts/primitives';

export interface NotificationPreferenceState {
  id: NotificationPreferenceId;
  identityId: IdentityId;
  globalChannels: Partial<Record<NotificationChannelType, boolean>>;
  workflowOverrides: Record<string, Partial<Record<NotificationChannelType, boolean>>>;
  quietHours: QuietHoursDTO | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class NotificationPreference extends AggregateRoot<NotificationPreferenceId> {
  private constructor(private readonly _props: NotificationPreferenceState) { super(_props.id); }
  get identityId(): IdentityId { return this._props.identityId; }
  get globalChannels() { return this._props.globalChannels; }
  get workflowOverrides() { return this._props.workflowOverrides; }
  get quietHours(): QuietHoursDTO | null { return this._props.quietHours; }
  get version(): number { return this._props.version; }
  get createdAt(): Date { return this._props.createdAt; }
  get updatedAt(): Date { return this._props.updatedAt; }
  get deletedAt(): Date | null { return this._props.deletedAt; }
  get isDeleted(): boolean { return this._props.deletedAt !== null; }
  isChannelEnabled(channel: NotificationChannelType): boolean | undefined { return this._props.globalChannels[channel]; }
  static load(state: NotificationPreferenceState): NotificationPreference { return new NotificationPreference(state); }
  toDTO(): NotificationPreferenceClientDTO {
    return {
      id: this.id as unknown as NotificationPreferenceIdBranded,
      identityId: this._props.identityId as unknown as IdentityIdBranded,
      globalChannels: this._props.globalChannels,
      workflowOverrides: this._props.workflowOverrides,
      quietHours: this._props.quietHours,
      version: this._props.version,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
      deletedAt: this._props.deletedAt?.getTime() ?? null,
    };
  }
}
