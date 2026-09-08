/**
 * ReminderResponse Entity
 * 提醒响应实体
 *
 * Records the user's action for a reminder occurrence. Response latency and
 * snooze delay are distinct scalar durations; neither is represented as Date.
 */

import {
  ReminderResponseAction,
  toReminderResponseLatencySeconds,
  toReminderSnoozeDurationSeconds,
  type ReminderResponseLatencySeconds,
  type ReminderSnoozeDurationSeconds,
  type ReminderResponseServerDTO,
  type ReminderResponseClientDTO,
} from '@memoflow/contracts/reminder';
import type { IdentityId, ReminderTemplateId } from '@memoflow/contracts/primitives';
import { ReminderResponseId } from '../value-objects/reminder-response-id';

export interface ReminderResponseState {
  id: ReminderResponseId;
  reminderTemplateId: ReminderTemplateId;
  identityId: IdentityId;
  action: ReminderResponseAction;
  responseTime: ReminderResponseLatencySeconds | null;
  snoozeDurationSeconds: ReminderSnoozeDurationSeconds | null;
  timestamp: Date;
}

export class ReminderResponse {
  private constructor(private readonly _props: ReminderResponseState) {}

  public get id(): string {
    return this._props.id.toString();
  }

  public get reminderTemplateId(): ReminderTemplateId {
    return this._props.reminderTemplateId;
  }

  public get identityId(): IdentityId {
    return this._props.identityId;
  }

  public get action(): ReminderResponseAction {
    return this._props.action;
  }

  /** Actual user response latency in seconds. */
  public get responseTime(): ReminderResponseLatencySeconds | null {
    return this._props.responseTime;
  }

  /** User-requested snooze delay in seconds; only present for SNOOZED. */
  public get snoozeDurationSeconds(): ReminderSnoozeDurationSeconds | null {
    return this._props.snoozeDurationSeconds;
  }

  public get timestamp(): Date {
    return this._props.timestamp;
  }

  public static create(params: {
    reminderTemplateId: string;
    identityId: string;
    action: ReminderResponseAction;
    responseTime?: number | null;
    snoozeDurationSeconds?: number | null;
    timestamp?: Date | number;
  }): ReminderResponse {
    const responseTime =
      params.responseTime == null ? null : toReminderResponseLatencySeconds(params.responseTime);
    const snoozeDurationSeconds =
      params.snoozeDurationSeconds == null
        ? null
        : toReminderSnoozeDurationSeconds(params.snoozeDurationSeconds);

    if (params.action === ReminderResponseAction.Snoozed && snoozeDurationSeconds == null) {
      throw new Error('SNOOZED responses require snoozeDurationSeconds');
    }
    if (params.action !== ReminderResponseAction.Snoozed && snoozeDurationSeconds != null) {
      throw new Error('snoozeDurationSeconds is only valid for SNOOZED responses');
    }

    return new ReminderResponse({
      id: ReminderResponseId.generate(),
      reminderTemplateId: params.reminderTemplateId as ReminderTemplateId,
      identityId: params.identityId as IdentityId,
      action: params.action,
      responseTime,
      snoozeDurationSeconds,
      timestamp: params.timestamp instanceof Date ? params.timestamp : new Date(params.timestamp ?? Date.now()),
    });
  }

  public static load(state: ReminderResponseState): ReminderResponse {
    return new ReminderResponse(state);
  }

  public isClicked(): boolean {
    return this._props.action === ReminderResponseAction.Clicked;
  }

  public isIgnored(): boolean {
    return this._props.action === ReminderResponseAction.Ignored;
  }

  public isSnoozed(): boolean {
    return this._props.action === ReminderResponseAction.Snoozed;
  }

  public isDismissed(): boolean {
    return this._props.action === ReminderResponseAction.Dismissed;
  }

  public isCompleted(): boolean {
    return this._props.action === ReminderResponseAction.Completed;
  }

  public isPositiveResponse(): boolean {
    return this.isClicked() || this.isCompleted();
  }

  public isNegativeResponse(): boolean {
    return this.isIgnored() || this.isDismissed();
  }

  public getResponseWeight(): number {
    switch (this._props.action) {
      case ReminderResponseAction.Completed:
        return 1.5;
      case ReminderResponseAction.Clicked:
        return 1;
      case ReminderResponseAction.Snoozed:
        return -0.2;
      case ReminderResponseAction.Dismissed:
        return -0.3;
      case ReminderResponseAction.Ignored:
        return -0.5;
      default:
        return 0;
    }
  }

  public toServerDTO(): ReminderResponseServerDTO {
    return {
      id: this._props.id.toString() as ReminderResponseServerDTO['id'],
      reminderTemplateId: this._props.reminderTemplateId,
      identityId: this._props.identityId,
      action: this._props.action,
      responseTime: this._props.responseTime,
      snoozeDurationSeconds: this._props.snoozeDurationSeconds,
      timestamp: this._props.timestamp.getTime(),
    };
  }

  public toClientDTO(): ReminderResponseClientDTO {
    const { identityId: _identityId, ...client } = this.toServerDTO();
    return client;
  }
}
