/**
 * Reminder Response Entity - Server DTO
 * 提醒响应实体 - 服务端 DTO
 */

import type { ReminderResponseId, ReminderTemplateId, IdentityId } from '../../../primitives';

/** Actual user response latency measured in non-negative integer seconds. */
export type ReminderResponseLatencySeconds =
  number & { readonly __brand: 'ReminderResponseLatencySeconds' };

export function toReminderResponseLatencySeconds(value: number): ReminderResponseLatencySeconds {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `Invalid reminder response latency: ${value} (must be non-negative integer seconds)`,
    );
  }
  return value as ReminderResponseLatencySeconds;
}

/** User-requested snooze delay measured in positive integer seconds. */
export type ReminderSnoozeDurationSeconds =
  number & { readonly __brand: 'ReminderSnoozeDurationSeconds' };

export function toReminderSnoozeDurationSeconds(value: number): ReminderSnoozeDurationSeconds {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Invalid reminder snooze duration: ${value} (must be positive integer seconds)`,
    );
  }
  return value as ReminderSnoozeDurationSeconds;
}

/** 响应行为类型 */
export const ReminderResponseAction = {
  Clicked: 'CLICKED',
  Ignored: 'IGNORED',
  Snoozed: 'SNOOZED',
  Dismissed: 'DISMISSED',
  Completed: 'COMPLETED',
} as const;

export type ReminderResponseAction =
  (typeof ReminderResponseAction)[keyof typeof ReminderResponseAction];

// Residual 861: sole ReminderResponseServerDTO body.
export interface ReminderResponseServerDTO {
  id: ReminderResponseId;
  reminderTemplateId: ReminderTemplateId;
  identityId: IdentityId;
  action: ReminderResponseAction;
  /** Measured latency from presentation to user response; never a snooze delay. */
  responseTime?: ReminderResponseLatencySeconds | null;
  /** Requested snooze delay; present only for SNOOZED responses. */
  snoozeDurationSeconds?: ReminderSnoozeDurationSeconds | null;
  timestamp: number; // epoch ms
}

// Residual 861: Client dual retired - public shape without identityId.
export type ReminderResponseClientDTO = Omit<ReminderResponseServerDTO, 'identityId'>;
