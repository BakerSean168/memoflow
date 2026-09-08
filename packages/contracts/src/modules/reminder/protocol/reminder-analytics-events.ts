import type { IdentityId, ReminderResponseId, ReminderTemplateId } from '../../../primitives/ids';
import type { ReminderResponseAction } from '../entities/reminder-response-server';

/**
 * Application/integration events emitted by reminder services.
 *
 * These are not aggregate domain events:
 * - `reminder:response:recorded` is produced when a ReminderResponse entity is persisted.
 * - `reminder:frequency-adjusted` is produced by the explicit interval adjustment command.
 */

export interface ReminderResponseRecordedEvent {
  identityId: IdentityId;
  responseId: ReminderResponseId;
  templateId: ReminderTemplateId;
  action: ReminderResponseAction;
  responseTime: number | null;
  snoozeDurationSeconds: number | null;
  recordedAt: number;
}

export interface ReminderFrequencyAdjustedEvent {
  identityId: IdentityId;
  templateId: ReminderTemplateId;
  originalInterval: number;
  adjustedInterval: number;
  reason: string;
  adjustedAt: number;
}
