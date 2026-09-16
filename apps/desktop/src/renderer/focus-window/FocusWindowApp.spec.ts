// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoutineWindowChannels, type FocusWindowProjection } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import FocusWindowApp from './FocusWindowApp.vue';

const t0 = Date.parse('2026-08-27T00:00:00.000Z');

function runningProjection(overrides: Partial<FocusWindowProjection> = {}): FocusWindowProjection {
  return {
    identityId: 'identity-1',
    sessionId: 'session-1',
    protocolId: 'protocol-1',
    protocolName: '50/10',
    protocolVersion: 1,
    state: 'Running',
    version: 2,
    phaseId: 'focus',
    phaseKind: 'Focus',
    phaseIndex: 0,
    phaseCount: 4,
    cycle: 1,
    totalCycles: 2,
    phaseDurationMs: 50 * 60_000,
    phaseDeadline: t0 + 5 * 60_000,
    pausedRemainingMs: null,
    remainingMs: 5 * 60_000,
    terminationReason: null,
    ...overrides,
  };
}

describe('FocusWindowApp (ROUTINE-4202)', () => {
  let projectionListener: ((payload: unknown) => void) | null = null;
  const invoke = vi.fn();
  const off = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    projectionListener = null;
    invoke.mockReset().mockImplementation(async (channel: string, command?: unknown) => {
      if (channel === RoutineWindowChannels.FOCUS_WINDOW_GET) return ok(runningProjection());
      if (channel === RoutineWindowChannels.FOCUS_WINDOW_COMMAND) {
        if ((command as { action?: string })?.action === 'pause') {
          return ok(
            runningProjection({
              state: 'Paused',
              version: 3,
              phaseDeadline: null,
              pausedRemainingMs: 4 * 60_000,
              remainingMs: 4 * 60_000,
            }),
          );
        }
        return ok(runningProjection());
      }
      throw new Error(`unexpected channel ${channel}`);
    });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        invoke,
        on: vi.fn((channel: string, callback: (payload: unknown) => void) => {
          if (channel === RoutineWindowChannels.FOCUS_WINDOW_PROJECTION)
            projectionListener = callback;
        }),
        off,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as { electronAPI?: unknown }).electronAPI;
  });

  it('renders countdown from durable phaseDeadline and never advances the domain phase itself', async () => {
    const wrapper = mount(FocusWindowApp);
    await vi.waitFor(() =>
      expect(wrapper.get('[data-testid="focus-countdown"]').text()).toBe('05:00'),
    );

    vi.advanceTimersByTime(61_000);
    await nextTick();
    expect(wrapper.get('[data-testid="focus-countdown"]').text()).toBe('03:59');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(RoutineWindowChannels.FOCUS_WINDOW_GET);

    projectionListener?.(
      runningProjection({
        phaseId: 'break',
        phaseKind: 'ShortBreak',
        phaseIndex: 1,
        phaseDurationMs: 10 * 60_000,
        phaseDeadline: t0 + 12 * 60_000,
        remainingMs: 10 * 60_000,
        version: 3,
      }),
    );
    await nextTick();
    expect(wrapper.text()).toContain('Short break');
    expect(wrapper.text()).toContain('Phase 2/4');

    wrapper.unmount();
    expect(off).toHaveBeenCalledWith(
      RoutineWindowChannels.FOCUS_WINDOW_PROJECTION,
      expect.any(Function),
    );
  });

  it('routes pause/collapse/always-on-top/hide commands through Main Process IPC', async () => {
    const wrapper = mount(FocusWindowApp);
    await vi.waitFor(() => expect(wrapper.text()).toContain('50/10'));

    await wrapper.get('.focus-window__session-actions button').trigger('click');
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(RoutineWindowChannels.FOCUS_WINDOW_COMMAND, {
        action: 'pause',
      }),
    );
    expect(wrapper.text()).toContain('Paused');
    expect(wrapper.get('[data-testid="focus-countdown"]').text()).toBe('04:00');

    await wrapper.get('button[aria-label="Collapse focus window"]').trigger('click');
    await wrapper.get('button[aria-label="Toggle always on top"]').trigger('click');
    await wrapper.get('button[aria-label="Hide focus window"]').trigger('click');

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(RoutineWindowChannels.FOCUS_WINDOW_COMMAND, {
        action: 'collapse',
        collapsed: true,
      });
      expect(invoke).toHaveBeenCalledWith(RoutineWindowChannels.FOCUS_WINDOW_COMMAND, {
        action: 'always-on-top',
        enabled: true,
      });
      expect(invoke).toHaveBeenCalledWith(RoutineWindowChannels.FOCUS_WINDOW_COMMAND, {
        action: 'hide',
      });
    });
    expect(wrapper.classes()).toContain('is-collapsed');
    wrapper.unmount();
  });
});
