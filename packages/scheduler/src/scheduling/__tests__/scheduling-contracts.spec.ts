import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSchedulingKey } from '../key';
import {
  assertHandlerKey,
  assertPayloadVersion,
  assertScheduledIntent,
  assertSchedulingOwner,
} from '../validation';

describe('neutral scheduling contracts', () => {
  it('builds deterministic collision-free keys from length-prefixed segments', () => {
    expect(buildSchedulingKey('goal', '123', 'remaining-days:7')).toBe(
      buildSchedulingKey('goal', '123', 'remaining-days:7'),
    );
    expect(buildSchedulingKey('a:b', 'c')).not.toBe(buildSchedulingKey('a', 'b:c'));
  });

  it('rejects ambiguous owner and handler identities', () => {
    expect(() =>
      assertSchedulingOwner({ identityId: ' identity-1', type: 'fake-module', id: 'owner-1' }),
    ).toThrow(/whitespace/);
    expect(() => assertHandlerKey('Fake Module Handler')).toThrow(/stable lowercase key/);
    expect(() => assertPayloadVersion(0)).toThrow(/positive safe integer/);
  });

  it('validates finite product-time Instants and JSON-facing intent metadata', () => {
    expect(() =>
      assertScheduledIntent({
        schedulingKey: buildSchedulingKey('fake-module', 'owner-1', 'fire'),
        handlerKey: 'fake.fire',
        runAt: Number.NaN,
        payloadVersion: 1,
        payload: {},
      }),
    ).toThrow(/finite Instant/);
  });

  it('keeps the fake business projection free of ScheduleTask aggregate imports', () => {
    const source = readFileSync(new URL('./fake-module.fixture.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('ScheduleTask');
    expect(source).not.toContain('/server/');
  });

  it('keeps the core HandlerRegistry feature-neutral', () => {
    const source = readFileSync(new URL('../handler-registry.ts', import.meta.url), 'utf8');
    for (const feature of ['goal', 'task', 'routine', 'reminder', 'notification']) {
      expect(source).not.toContain(`@memoflow/${feature}`);
    }
  });
});
