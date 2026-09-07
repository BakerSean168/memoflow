import { describe, expect, it } from 'vitest';
import { RecordReminderResponseSchema } from './reminder-response.dto';

describe('RecordReminderResponseSchema', () => {
  it('keeps response latency and snooze delay as independent fields', () => {
    expect(
      RecordReminderResponseSchema.parse({
        action: 'SNOOZED',
        responseTime: 7,
        snoozeDurationSeconds: 900,
      }),
    ).toEqual({
      action: 'SNOOZED',
      responseTime: 7,
      snoozeDurationSeconds: 900,
    });
  });

  it('rejects SNOOZED without an explicit snooze duration', () => {
    expect(
      RecordReminderResponseSchema.safeParse({ action: 'SNOOZED', responseTime: 900 }).success,
    ).toBe(false);
  });

  it('rejects snoozeDurationSeconds on non-snooze responses', () => {
    expect(
      RecordReminderResponseSchema.safeParse({
        action: 'CLICKED',
        responseTime: 5,
        snoozeDurationSeconds: 60,
      }).success,
    ).toBe(false);
  });

  it('rejects negative/fractional response latency and non-positive snooze delay', () => {
    expect(RecordReminderResponseSchema.safeParse({ action: 'CLICKED', responseTime: -1 }).success).toBe(false);
    expect(RecordReminderResponseSchema.safeParse({ action: 'CLICKED', responseTime: 1.5 }).success).toBe(false);
    expect(
      RecordReminderResponseSchema.safeParse({ action: 'SNOOZED', snoozeDurationSeconds: 0 }).success,
    ).toBe(false);
  });
});
