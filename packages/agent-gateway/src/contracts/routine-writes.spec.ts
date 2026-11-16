import { describe, expect, it } from 'vitest';
import {
  GatewayRoutineCreateSchema,
  GatewayRoutineDeleteSchema,
  GatewayRoutineOverrideSchema,
  GatewayRoutinePauseSchema,
  GatewayRoutineUpdateSchema,
  GatewayRoutineReceiptSchema,
  GatewayRoutineUpdateReceiptSchema,
  GatewayRoutineDeleteReceiptSchema,
  GatewayRoutineOverrideReceiptSchema,
} from './writes';
import { CreateScopedPatSchema, ExternalAgentConsentSchema } from './index';

const routineId = '5b5d8a2b-9934-4be8-8e07-3f62ed122e15';
const input = {
  idempotencyKey: 'once',
  name: ' Review ',
  trigger: {
    type: 'WallClock',
    localTime: '09:00',
    timeZone: 'Asia/Shanghai',
    startDate: '2026-10-20',
  },
};
const recurrence = {
  startDate: '2026-10-20',
  frequency: 'weekly',
  interval: 2,
  byWeekday: [1, 3],
  count: 12,
  until: null,
};

describe('hosted Routine write contracts', () => {
  it('accepts the one-shot shorthand and a legal owner recurrence', () => {
    expect(GatewayRoutineCreateSchema.parse(input).name).toBe('Review');
    expect(
      GatewayRoutineCreateSchema.parse({
        ...input,
        trigger: { ...input.trigger, startDate: undefined, recurrence },
      }).trigger.recurrence,
    ).toMatchObject(recurrence);
  });

  it('rejects ambiguous or unbounded hosted recurrence', () => {
    for (const trigger of [
      { ...input.trigger, recurrence },
      {
        type: 'WallClock',
        localTime: '09:00',
        timeZone: 'Asia/Shanghai',
      },
      { ...input.trigger, startDate: undefined, recurrence: { ...recurrence, interval: 367 } },
      { ...input.trigger, startDate: undefined, recurrence: { ...recurrence, count: 1001 } },
      {
        ...input.trigger,
        startDate: undefined,
        recurrence: { ...recurrence, byWeekday: [1, 1] },
      },
    ])
      expect(GatewayRoutineCreateSchema.safeParse({ ...input, trigger }).success).toBe(false);
  });

  it('keeps owner-internal fields and invalid trigger values out', () => {
    for (const key of [
      'identityId',
      'routineId',
      'profileIds',
      'enabled',
      'url',
      'path',
      'deviceId',
    ])
      expect(GatewayRoutineCreateSchema.safeParse({ ...input, [key]: 'foreign' }).success).toBe(
        false,
      );
    for (const patch of [
      { type: 'Elapsed' },
      { localTime: '24:00' },
      { startDate: '2026-02-30' },
      { timeZone: 'invalid/zone' },
    ])
      expect(
        GatewayRoutineCreateSchema.safeParse({
          ...input,
          trigger: { ...input.trigger, ...patch },
        }).success,
      ).toBe(false);
    for (const patch of [
      { name: '' },
      { name: 'a'.repeat(101) },
      { description: 'a'.repeat(2001) },
      { description: null },
      { idempotencyKey: 'a'.repeat(201) },
      { idempotencyKey: ' ' },
    ])
      expect(GatewayRoutineCreateSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });

  it('requires versioned, non-empty updates and a WallClock trigger', () => {
    expect(
      GatewayRoutineUpdateSchema.parse({
        idempotencyKey: 'update',
        routineId,
        expectedVersion: 3,
        enabled: false,
      }),
    ).toMatchObject({ routineId, expectedVersion: 3, enabled: false });
    for (const patch of [
      { expectedVersion: 0 },
      { expectedVersion: undefined },
      { name: undefined, expectedVersion: 3 },
      {
        trigger: {
          type: 'Elapsed',
          timingOwner: 'scheduler',
          durationMs: 1000,
          anchor: 'last-satisfied',
        },
      },
    ])
      expect(
        GatewayRoutineUpdateSchema.safeParse({
          idempotencyKey: 'update',
          routineId,
          expectedVersion: 3,
          ...patch,
        }).success,
      ).toBe(false);
  });

  it('requires the read version for delete and bounds pause/override', () => {
    expect(
      GatewayRoutineDeleteSchema.safeParse({ idempotencyKey: 'delete', routineId }).success,
    ).toBe(false);
    expect(
      GatewayRoutineDeleteSchema.parse({ idempotencyKey: 'delete', routineId, expectedVersion: 2 }),
    ).toEqual({ idempotencyKey: 'delete', routineId, expectedVersion: 2 });

    expect(
      GatewayRoutinePauseSchema.safeParse({
        idempotencyKey: 'pause',
        routineId,
        until: 0,
        reason: 'lunch',
      }).success,
    ).toBe(false);
    expect(
      GatewayRoutinePauseSchema.parse({
        idempotencyKey: 'pause',
        routineId,
        until: 1792458000000,
        reason: 'lunch',
      }),
    ).toMatchObject({ until: 1792458000000 });

    const override = {
      idempotencyKey: 'override',
      routineId,
      suppressUntil: 1792458000000,
      expiresAt: 1792458000000,
      reason: 'travel',
    };
    expect(GatewayRoutineOverrideSchema.parse(override)).toMatchObject(override);
    for (const patch of [
      { suppressUntil: null },
      { overrideIntervalMs: 999 },
      { overrideIntervalMs: 604_800_001 },
      { reason: '' },
    ])
      expect(GatewayRoutineOverrideSchema.safeParse({ ...override, ...patch }).success).toBe(false);
  });

  it('issues all six PAT scopes explicitly while OAuth stays read-only', () => {
    expect(
      CreateScopedPatSchema.parse({
        name: 'routine',
        scopes: ['routines:read', 'routines:write'],
      }).scopes,
    ).toEqual(['routines:read', 'routines:write']);
    expect(
      CreateScopedPatSchema.parse({
        name: 'all',
        scopes: [
          'goals:read',
          'goals:write',
          'tasks:read',
          'tasks:write',
          'routines:read',
          'routines:write',
        ],
      }).scopes,
    ).toHaveLength(6);
    expect(
      CreateScopedPatSchema.safeParse({
        name: 'too-many',
        scopes: [
          'goals:read',
          'goals:write',
          'tasks:read',
          'tasks:write',
          'routines:read',
          'routines:write',
          'routines:write',
        ],
      }).success,
    ).toBe(false);
    expect(ExternalAgentConsentSchema.shape.scopes.safeParse(['routines:write']).success).toBe(
      false,
    );
  });

  it('returns strict minimal receipts without owner read bodies', () => {
    const create = {
      receiptId: 'a'.repeat(64),
      result: {
        routine: { id: routineId, version: 1, name: 'Review' },
        scheduledFor: 1792458000000,
      },
      replayed: false,
    };
    expect(GatewayRoutineReceiptSchema.parse(create)).toEqual(create);
    expect(
      GatewayRoutineReceiptSchema.safeParse({
        ...create,
        result: { ...create.result, description: 'private' },
      }).success,
    ).toBe(false);

    const update = {
      receiptId: 'b'.repeat(64),
      result: { routine: { id: routineId, version: 2, name: 'Review' } },
    };
    expect(GatewayRoutineUpdateReceiptSchema.parse(update)).toEqual(update);

    const deleted = { receiptId: 'c'.repeat(64), result: { routineId } };
    expect(GatewayRoutineDeleteReceiptSchema.parse(deleted)).toEqual(deleted);

    const override = {
      receiptId: 'd'.repeat(64),
      result: {
        routineId,
        override: {
          routineId,
          snoozeUntil: 1792458000000,
          suppressUntil: null,
          overrideIntervalMs: null,
          expiresAt: 1792458000000,
          reason: 'lunch',
          source: 'user',
        },
      },
    };
    expect(GatewayRoutineOverrideReceiptSchema.parse(override)).toEqual(override);
    expect(
      GatewayRoutineOverrideReceiptSchema.safeParse({
        ...override,
        result: { ...override.result, identityId: 'foreign' },
      }).success,
    ).toBe(false);
  });
});
