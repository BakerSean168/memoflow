import type {
  NotificationPreferenceServerDTO,
  NotificationPreferenceClientDTO,
  NotificationChannelType,
} from '@memoflow/contracts/notification';
import type {
  IdentityId,
  NotificationPreferenceId as NotificationPreferenceIdBranded,
} from '@memoflow/contracts/primitives';
import { AggregateRoot } from '@memoflow/utils/domain';
import { NotificationPreferenceId } from '../value-objects/notification-preference-id';
import { QuietHours } from '../value-objects/quiet-hours';

export interface NotificationPreferenceState {
  id: NotificationPreferenceId;
  identityId: IdentityId;
  globalChannels: Map<NotificationChannelType, boolean>;
  workflowOverrides: Map<string, Map<NotificationChannelType, boolean>>;
  quietHours?: QuietHours | null;
  version: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** User-owned preference layers. Platform delivery guards are intentionally separate. */
export class NotificationPreference extends AggregateRoot<NotificationPreferenceId> {
  private _props: NotificationPreferenceState;

  private constructor(state: NotificationPreferenceState) {
    super(state.id);
    this._props = {
      ...state,
      globalChannels: new Map(state.globalChannels),
      workflowOverrides: new Map(
        [...state.workflowOverrides].map(([key, value]) => [key, new Map(value)]),
      ),
    };
  }

  get identityId(): IdentityId { return this._props.identityId; }
  get globalChannels(): Map<NotificationChannelType, boolean> { return new Map(this._props.globalChannels); }
  get workflowOverrides(): Map<string, Map<NotificationChannelType, boolean>> {
    return new Map([...this._props.workflowOverrides].map(([key, value]) => [key, new Map(value)]));
  }
  get quietHours(): QuietHours | null { return this._props.quietHours ?? null; }
  get version(): number { return this._props.version; }
  get deletedAt(): Date | null { return this._props.deletedAt; }
  get createdAt(): Date { return this._props.createdAt; }
  get updatedAt(): Date { return this._props.updatedAt; }

  getGlobalChannel(channel: NotificationChannelType): boolean | undefined {
    return this._props.globalChannels.get(channel);
  }

  setGlobalChannel(channel: NotificationChannelType, enabled: boolean): void {
    this._props.globalChannels.set(channel, enabled);
    this.touch();
  }

  clearGlobalChannel(channel: NotificationChannelType): void {
    this._props.globalChannels.delete(channel);
    this.touch();
  }

  getWorkflowChannelOverride(
    workflowKey: string,
    channel: NotificationChannelType,
  ): boolean | undefined {
    return this._props.workflowOverrides.get(workflowKey)?.get(channel);
  }

  setWorkflowChannelOverride(
    workflowKey: string,
    channel: NotificationChannelType,
    enabled: boolean,
  ): void {
    const override = this._props.workflowOverrides.get(workflowKey) ?? new Map();
    override.set(channel, enabled);
    this._props.workflowOverrides.set(workflowKey, override);
    this.touch();
  }

  clearWorkflowChannelOverride(workflowKey: string, channel: NotificationChannelType): void {
    const override = this._props.workflowOverrides.get(workflowKey);
    if (!override) return;
    override.delete(channel);
    if (override.size === 0) this._props.workflowOverrides.delete(workflowKey);
    this.touch();
  }

  setQuietHours(config: QuietHours | null): void {
    this._props.quietHours = config;
    this.touch();
  }

  toServerDTO(): NotificationPreferenceServerDTO {
    return {
      id: this.id as NotificationPreferenceIdBranded,
      identityId: this._props.identityId,
      globalChannels: Object.fromEntries(this._props.globalChannels),
      workflowOverrides: Object.fromEntries(
        [...this._props.workflowOverrides].map(([key, value]) => [key, Object.fromEntries(value)]),
      ),
      quietHours: this.quietHours?.toDTO() ?? null,
      version: this._props.version,
      deletedAt: this._props.deletedAt?.getTime() ?? null,
      createdAt: this._props.createdAt.getTime(),
      updatedAt: this._props.updatedAt.getTime(),
    };
  }

  toClientDTO(): NotificationPreferenceClientDTO {
    return this.toServerDTO() as NotificationPreferenceClientDTO;
  }

  static load(state: NotificationPreferenceState): NotificationPreference {
    return new NotificationPreference(state);
  }

  static create(params: { identityId: IdentityId }): NotificationPreference {
    const now = new Date();
    return new NotificationPreference({
      id: NotificationPreferenceId.of(NotificationPreferenceId.generate()),
      identityId: params.identityId,
      globalChannels: new Map(),
      workflowOverrides: new Map(),
      quietHours: null,
      version: 1,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  private touch(): void { this._props.updatedAt = new Date(); }
}
