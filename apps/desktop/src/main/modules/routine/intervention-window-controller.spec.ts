import { describe, expect, it, vi } from 'vitest';
import {
  createInterventionRuntime,
  type InterventionPolicy,
} from '@memoflow/reminder/routine-runtime';
import {
  createInterventionWindowController,
  type InterventionWindowHost,
} from './intervention-window-controller';

const minute = 60_000;
const t0 = Date.parse('2026-08-27T04:00:00.000Z');
const policy: InterventionPolicy = {
  gentleDurationMs: 2 * minute,
  graceDurationMs: 3 * minute,
  guidedDurationMs: 5 * minute,
  strictEnabled: false,
};

function hostHarness(): InterventionWindowHost & {
  calls: Array<{ type: string; value?: unknown }>;
  requestClose(): void;
} {
  const calls: Array<{ type: string; value?: unknown }> = [];
  let closeListener: (() => void) | null = null;
  return {
    calls,
    show: (value) => calls.push({ type: 'show', value }),
    update: (value) => calls.push({ type: 'update', value }),
    hide: () => calls.push({ type: 'hide' }),
    onCloseRequested: (listener) => {
      closeListener = listener;
      return () => {
        if (closeListener === listener) closeListener = null;
      };
    },
    requestClose: () => closeListener?.(),
    destroy: () => calls.push({ type: 'destroy' }),
  };
}

function createDue(
  runtime: ReturnType<typeof createInterventionRuntime>,
  occurrenceKey: string,
  dueAt = t0,
): void {
  runtime.createDue({
    identityId: 'identity-1',
    routineId: occurrenceKey.split(':')[1] ?? occurrenceKey,
    occurrenceKey,
    dueAt,
    policy,
  });
}

function noTimer() {
  return {
    setTimeout: (() => ({ unref() {} })) as unknown as typeof globalThis.setTimeout,
    clearTimeout: vi.fn() as unknown as typeof globalThis.clearTimeout,
  };
}

describe('InterventionWindowController (ROUTINE-4104)', () => {
  it('keeps one surface, prioritizes the stronger phase, then reveals the next active occurrence', async () => {
    const runtime = createInterventionRuntime();
    createDue(runtime, 'routine:stand:0');
    createDue(runtime, 'routine:eyes:0', t0 - 5 * minute);
    runtime.advance('routine:eyes:0', t0);
    const host = hostHarness();
    const controller = createInterventionWindowController({
      runtime,
      host,
      now: () => t0,
      ...noTimer(),
    });

    expect(controller.restoreIdentity('identity-1')).toMatchObject({
      occurrenceKey: 'routine:eyes:0',
      state: 'Guided',
    });
    expect(host.calls.filter((call) => call.type === 'show')).toHaveLength(1);

    expect(await controller.execute({ action: 'complete' })).toMatchObject({
      occurrenceKey: 'routine:stand:0',
      state: 'Gentle',
    });
    expect(runtime.getSnapshot('routine:eyes:0')?.state).toBe('Completed');
    expect(runtime.getSnapshot('routine:stand:0')?.state).toBe('Gentle');
    expect(host.calls.filter((call) => call.type === 'show')).toHaveLength(2);

    controller.destroy();
  });

  it('maps native close to an explicit dismiss runtime command', async () => {
    const runtime = createInterventionRuntime();
    createDue(runtime, 'routine:stand:close');
    const host = hostHarness();
    const controller = createInterventionWindowController({
      runtime,
      host,
      now: () => t0,
      ...noTimer(),
    });
    controller.restoreIdentity('identity-1');

    host.requestClose();
    await vi.waitFor(() => {
      expect(runtime.getSnapshot('routine:stand:close')?.state).toBe('Dismissed');
    });

    expect(runtime.getSnapshot('routine:stand:close')?.state).toBe('Dismissed');
    expect(controller.getProjection()).toBeNull();
    expect(host.calls[host.calls.length - 1]?.type).toBe('hide');
    controller.destroy();
  });

  it('persists the owner command before advancing the surface and fails closed on write error', async () => {
    const runtime = createInterventionRuntime();
    createDue(runtime, 'routine:eyes:durable');
    const host = hostHarness();
    const onCommand = vi.fn().mockRejectedValueOnce(new Error('local db unavailable'));
    const controller = createInterventionWindowController({
      runtime,
      host,
      onCommand,
      now: () => t0,
      ...noTimer(),
    });
    controller.restoreIdentity('identity-1');

    await expect(controller.execute({ action: 'complete' })).rejects.toThrow(/local db unavailable/);
    expect(runtime.getSnapshot('routine:eyes:durable')?.state).toBe('Gentle');
    expect(controller.getProjection()?.occurrenceKey).toBe('routine:eyes:durable');
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: 'routine:eyes:durable:v2:complete',
        command: { action: 'complete' },
        at: t0,
      }),
    );

    onCommand.mockResolvedValueOnce(undefined);
    await expect(controller.execute({ action: 'complete' })).resolves.toBeNull();
    expect(runtime.getSnapshot('routine:eyes:durable')?.state).toBe('Completed');
    controller.destroy();
  });

  it('uses Main Process deadlines to advance phases without a renderer tick', () => {
    const runtime = createInterventionRuntime();
    createDue(runtime, 'routine:stand:timer');
    let now = t0;
    const callbacks: Array<() => void> = [];
    const host = hostHarness();
    const controller = createInterventionWindowController({
      runtime,
      host,
      now: () => now,
      setTimeout: ((callback: () => void) => {
        callbacks.push(callback);
        return { unref() {} };
      }) as unknown as typeof globalThis.setTimeout,
      clearTimeout: vi.fn() as unknown as typeof globalThis.clearTimeout,
    });

    expect(controller.restoreIdentity('identity-1')?.state).toBe('Gentle');
    expect(callbacks).toHaveLength(1);
    now = t0 + 2 * minute;
    callbacks.shift()?.();
    expect(controller.getProjection()?.state).toBe('Grace');
    expect(callbacks).toHaveLength(1);

    controller.destroy();
  });

  it('never lets the ordinary InterventionWindow acquire Strict overlay capability', () => {
    const runtime = createInterventionRuntime();
    runtime.createDue({
      identityId: 'identity-1',
      routineId: 'strict-routine',
      occurrenceKey: 'routine:strict:0',
      dueAt: t0,
      policy: { ...policy, strictEnabled: true },
    });
    runtime.advance('routine:strict:0', t0 + 20 * minute);
    const host = hostHarness();
    const controller = createInterventionWindowController({
      runtime,
      host,
      now: () => t0 + 20 * minute,
      ...noTimer(),
    });

    expect(runtime.getSnapshot('routine:strict:0')?.state).toBe('Strict');
    expect(controller.restoreIdentity('identity-1')).toBeNull();
    expect(runtime.getSnapshot('routine:strict:0')?.state).toBe('Strict');
    expect(host.calls.some((call) => call.type === 'show')).toBe(false);
    controller.destroy();
  });

  it('reconstructs the projection from restored runtime truth after a window/controller restart', () => {
    const firstRuntime = createInterventionRuntime();
    createDue(firstRuntime, 'routine:eyes:restart');
    firstRuntime.advance('routine:eyes:restart', t0 + 5 * minute);
    const snapshot = firstRuntime.getSnapshot('routine:eyes:restart')!;

    const restoredRuntime = createInterventionRuntime();
    restoredRuntime.restore(snapshot);
    const host = hostHarness();
    const controller = createInterventionWindowController({
      runtime: restoredRuntime,
      host,
      now: () => t0 + 6 * minute,
      ...noTimer(),
    });

    expect(controller.restoreIdentity('identity-1')).toMatchObject({
      occurrenceKey: 'routine:eyes:restart',
      state: 'Guided',
      version: snapshot.version,
    });
    expect(host.calls[0]?.type).toBe('show');
    controller.destroy();
  });
});
