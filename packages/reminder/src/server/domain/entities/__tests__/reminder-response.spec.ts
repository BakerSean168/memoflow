import { describe, expect, it } from 'vitest';
import { ReminderResponse } from '../reminder-response';
import { ReminderResponseId } from '../../value-objects/reminder-response-id';
import type { IdentityId, ReminderTemplateId } from '@memoflow/contracts/primitives';
import {
  toReminderResponseLatencySeconds,
  toReminderSnoozeDurationSeconds,
} from '@memoflow/contracts/reminder';

describe('ReminderResponse entity', () => {
  it('keeps response latency as scalar seconds instead of encoding duration as Date', () => {
    const response = ReminderResponse.create({
      reminderTemplateId: 'template-1',
      identityId: 'identity-1',
      action: 'CLICKED',
      responseTime: 45,
      timestamp: 1_000,
    });

    expect(response.reminderTemplateId).toBe('template-1');
    expect(response.identityId).toBe('identity-1');
    expect(response.timestamp.getTime()).toBe(1_000);
    expect(response.responseTime).toBe(45);
    expect(response.snoozeDurationSeconds).toBeNull();
    expect(response.toServerDTO()).toEqual({
      id: response.id,
      reminderTemplateId: 'template-1',
      identityId: 'identity-1',
      action: 'CLICKED',
      responseTime: 45,
      snoozeDurationSeconds: null,
      timestamp: 1_000,
    });
  });

  it('keeps snooze delay separate from measured response latency', () => {
    const response = ReminderResponse.create({
      reminderTemplateId: 'template-1',
      identityId: 'identity-1',
      action: 'SNOOZED',
      responseTime: 12,
      snoozeDurationSeconds: 900,
      timestamp: 2_000,
    });

    expect(response.responseTime).toBe(12);
    expect(response.snoozeDurationSeconds).toBe(900);
    expect(response.toClientDTO()).toMatchObject({
      action: 'SNOOZED',
      responseTime: 12,
      snoozeDurationSeconds: 900,
    });
  });

  it('enforces snooze-duration action invariants', () => {
    expect(() =>
      ReminderResponse.create({
        reminderTemplateId: 'template-1',
        identityId: 'identity-1',
        action: 'SNOOZED',
      }),
    ).toThrow('SNOOZED responses require snoozeDurationSeconds');

    expect(() =>
      ReminderResponse.create({
        reminderTemplateId: 'template-1',
        identityId: 'identity-1',
        action: 'CLICKED',
        snoozeDurationSeconds: 300,
      }),
    ).toThrow('snoozeDurationSeconds is only valid for SNOOZED responses');
  });

  it('covers response predicates and weight mapping for all actions', () => {
    const actions = [
      { action: 'CLICKED' as const, weight: 1.0, positive: true, method: 'isClicked' as const },
      { action: 'IGNORED' as const, weight: -0.5, negative: true, method: 'isIgnored' as const },
      { action: 'SNOOZED' as const, weight: -0.2, method: 'isSnoozed' as const },
      { action: 'DISMISSED' as const, weight: -0.3, negative: true, method: 'isDismissed' as const },
      { action: 'COMPLETED' as const, weight: 1.5, positive: true, method: 'isCompleted' as const },
    ];

    for (const entry of actions) {
      const response = ReminderResponse.create({
        reminderTemplateId: 'template-1',
        identityId: 'identity-1',
        action: entry.action,
        ...(entry.action === 'SNOOZED' ? { snoozeDurationSeconds: 60 } : {}),
      });

      expect(response[entry.method]()).toBe(true);
      expect(response.getResponseWeight()).toBe(entry.weight);
      expect(response.isPositiveResponse()).toBe(entry.positive ?? false);
      expect(response.isNegativeResponse()).toBe(entry.negative ?? false);
    }
  });

  it('loads persisted scalar durations without unit conversion', () => {
    const loaded = ReminderResponse.load({
      id: ReminderResponseId.generate(),
      reminderTemplateId: 'template-2' as ReminderTemplateId,
      identityId: 'identity-2' as IdentityId,
      action: 'SNOOZED',
      responseTime: toReminderResponseLatencySeconds(7),
      snoozeDurationSeconds: toReminderSnoozeDurationSeconds(600),
      timestamp: new Date(2_000),
    });

    expect(loaded.responseTime).toBe(7);
    expect(loaded.snoozeDurationSeconds).toBe(600);
    expect(loaded.toClientDTO()).toEqual({
      id: loaded.id,
      reminderTemplateId: 'template-2',
      action: 'SNOOZED',
      responseTime: 7,
      snoozeDurationSeconds: 600,
      timestamp: 2_000,
    });
  });
});
