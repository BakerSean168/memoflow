import { describe, expect, it, vi } from 'vitest';
import { asInstant } from '@memoflow/time';
import {
  createInMemoryProtocolSessionStore,
  createProtocolSessionRuntime,
} from '@memoflow/reminder/routine-runtime';
import { ProtocolDefinition, ProtocolSession } from '@memoflow/reminder/server';
import {
  createFocusWindowController,
  type FocusTaskbarIntegrationPort,
  type FocusWindowHost,
} from './focus-window-controller';

const minute = 60_000;
const t0 = Date.parse('2026-08-27T00:00:00.000Z');

function runningSession(): ProtocolSession {
  const protocol = ProtocolDefinition.create({
    id: 'focus-protocol',
    identityId: 'identity-1',
    name: '50/10 x2',
    phases: [
      { id: 'focus', kind: 'Focus', role: 'cycle', durationMs: 50 * minute },
      { id: 'break', kind: 'ShortBreak', role: 'cycle', durationMs: 10 * minute },
    ],
    cyclePolicy: { mode: 'fixed', cycles: 2 },
    breakPolicy: { afterFinalCycle: 'include' },
    now: asInstant(t0),
  });
  const session = ProtocolSession.create({
    id: 'focus-session',
    identityId: 'identity-1',
    protocol,
    now: asInstant(t0),
  });
  session.start(asInstant(t0));
  return session;
}

function hostHarness(): FocusWindowHost & {
  calls: Array<{ type: string; value?: unknown }>;
} {
  const calls: Array<{ type: string; value?: unknown }> = [];
  return {
    calls,
    show: (value) => calls.push({ type: 'show', value }),
    update: (value) => calls.push({ type: 'update', value }),
    hide: () => calls.push({ type: 'hide' }),
    setCollapsed: (value) => calls.push({ type: 'collapse', value }),
    setAlwaysOnTop: (value) => calls.push({ type: 'always-on-top', value }),
    destroy: () => calls.push({ type: 'destroy' }),
  };
}

function taskbarHarness(): FocusTaskbarIntegrationPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    update: () => calls.push('update'),
    clear: () => calls.push('clear'),
  };
}

describe('FocusWindowController (ROUTINE-4202)', () => {
  it('projects durable phase/cycle/countdown and hiding never mutates the ProtocolSession', async () => {
    const store = createInMemoryProtocolSessionStore();
    await store.create(runningSession());
    const now = t0 + 25 * minute;
    const host = hostHarness();
    const taskbar = taskbarHarness();
    const controller = createFocusWindowController({
      store,
      runtime: createProtocolSessionRuntime({ store, now: () => now }),
      host,
      taskbar,
      now: () => now,
      setTimeout: (() => ({ unref() {} })) as unknown as typeof globalThis.setTimeout,
      clearTimeout: vi.fn(),
    });

    const projection = await controller.open('identity-1', 'focus-session');
    expect(projection).toMatchObject({
      state: 'Running',
      protocolName: '50/10 x2',
      phaseKind: 'Focus',
      cycle: 1,
      totalCycles: 2,
      phaseIndex: 0,
      phaseCount: 4,
      remainingMs: 25 * minute,
    });
    const beforeHide = (await store.findById({
      identityId: 'identity-1',
      sessionId: 'focus-session',
    }))!.snapshot();

    await controller.execute({ action: 'hide' });
    const afterHide = (await store.findById({
      identityId: 'identity-1',
      sessionId: 'focus-session',
    }))!.snapshot();
    expect(afterHide).toEqual(beforeHide);
    expect(host.calls[host.calls.length - 1]).toEqual({ type: 'hide' });
    expect(taskbar.calls[taskbar.calls.length - 1]).toBe('clear');

    await controller.open('identity-1', 'focus-session');
    expect(host.calls[host.calls.length - 1]?.type).toBe('show');

    controller.destroy();
  });

  it('Fixture H Desktop: 50/10 restores after app restart and catches up a missed deadline without a renderer tick', async () => {
    const store = createInMemoryProtocolSessionStore();
    await store.create(runningSession());
    const firstHost = hostHarness();
    const first = createFocusWindowController({
      store,
      runtime: createProtocolSessionRuntime({ store }),
      host: firstHost,
      now: () => t0 + 20 * minute,
      setTimeout: (() => ({ unref() {} })) as unknown as typeof globalThis.setTimeout,
      clearTimeout: vi.fn(),
    });
    await first.open('identity-1', 'focus-session');
    first.destroy();

    const restartedHost = hostHarness();
    const restarted = createFocusWindowController({
      store,
      runtime: createProtocolSessionRuntime({ store }),
      host: restartedHost,
      now: () => t0 + 55 * minute,
      setTimeout: (() => ({ unref() {} })) as unknown as typeof globalThis.setTimeout,
      clearTimeout: vi.fn(),
    });
    const projection = await restarted.restoreIdentity('identity-1');

    expect(projection).toMatchObject({
      state: 'Running',
      phaseKind: 'ShortBreak',
      cycle: 1,
      remainingMs: 5 * minute,
    });
    expect(restartedHost.calls[0]?.type).toBe('show');
    restarted.destroy();
  });

  it('routes pause/resume/end through durable runtime while collapse and always-on-top remain presentation-only', async () => {
    const store = createInMemoryProtocolSessionStore();
    await store.create(runningSession());
    let now = t0 + 20 * minute;
    const host = hostHarness();
    const controller = createFocusWindowController({
      store,
      runtime: createProtocolSessionRuntime({ store }),
      host,
      now: () => now,
      setTimeout: (() => ({ unref() {} })) as unknown as typeof globalThis.setTimeout,
      clearTimeout: vi.fn(),
    });
    await controller.open('identity-1', 'focus-session');

    const versionBeforePresentation = controller.getProjection()!.version;
    await controller.execute({ action: 'collapse', collapsed: true });
    await controller.execute({ action: 'always-on-top', enabled: true });
    expect(controller.getProjection()!.version).toBe(versionBeforePresentation);

    expect(await controller.execute({ action: 'pause' })).toMatchObject({
      state: 'Paused',
      pausedRemainingMs: 30 * minute,
    });
    now = t0 + 80 * minute;
    expect(await controller.execute({ action: 'resume' })).toMatchObject({
      state: 'Running',
      phaseDeadline: t0 + 110 * minute,
      remainingMs: 30 * minute,
    });
    now = t0 + 85 * minute;
    expect(await controller.execute({ action: 'end' })).toMatchObject({ state: 'Completed' });
    expect(await store.listRecoverable({ identityId: 'identity-1' })).toEqual([]);

    controller.destroy();
  });
});
