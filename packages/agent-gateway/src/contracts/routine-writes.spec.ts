import { describe, expect, it } from 'vitest';
import { GatewayRoutineCreateSchema, GatewayRoutineReceiptSchema } from './writes';
import { CreateScopedPatSchema, ExternalAgentConsentSchema } from './index';
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
describe('hosted one-shot Routine contract', () => {
  it('composes owner bounds and accepts only a finite one-shot input', () => {
    expect(GatewayRoutineCreateSchema.parse(input).name).toBe('Review');
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
    for (const key of [
      'timingOwner',
      'frequency',
      'interval',
      'byWeekday',
      'count',
      'until',
      'recurrence',
    ])
      expect(
        GatewayRoutineCreateSchema.safeParse({
          ...input,
          trigger: { ...input.trigger, [key]: 1 },
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
  });
  it('issues the fifth PAT scope explicitly while OAuth stays read-only', () => {
    expect(
      CreateScopedPatSchema.parse({
        name: 'routine',
        scopes: ['routines:write'],
      }).scopes,
    ).toEqual(['routines:write']);
    expect(
      CreateScopedPatSchema.parse({
        name: 'all',
        scopes: ['goals:read', 'goals:write', 'tasks:read', 'tasks:write', 'routines:write'],
      }).scopes,
    ).toHaveLength(5);
    expect(ExternalAgentConsentSchema.shape.scopes.safeParse(['routines:write']).success).toBe(
      false,
    );
  });
  it('returns a strict minimal receipt with owner identity/version and scheduled instant', () => {
    const receipt = {
      receiptId: 'a'.repeat(64),
      result: {
        routine: {
          id: '5b5d8a2b-9934-4be8-8e07-3f62ed122e15',
          version: 1,
          name: 'Review',
        },
        scheduledFor: 1792458000000,
      },
      replayed: false,
    };
    expect(GatewayRoutineReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(
      GatewayRoutineReceiptSchema.safeParse({
        ...receipt,
        result: { ...receipt.result, description: 'private' },
      }).success,
    ).toBe(false);
    expect(
      GatewayRoutineReceiptSchema.safeParse({
        ...receipt,
        result: {
          ...receipt.result,
          routine: { ...receipt.result.routine, identityId: 'foreign' },
        },
      }).success,
    ).toBe(false);
  });
});
