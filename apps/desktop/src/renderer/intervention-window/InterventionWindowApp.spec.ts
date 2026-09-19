// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RoutineWindowChannels,
  type InterventionWindowProjection,
} from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import InterventionWindowApp from './InterventionWindowApp.vue';

const t0 = Date.parse('2026-08-27T04:00:00.000Z');

function gentleProjection(
  overrides: Partial<InterventionWindowProjection> = {},
): InterventionWindowProjection {
  return {
    identityId: 'identity-1',
    routineId: 'stand',
    occurrenceKey: 'routine:stand:0',
    state: 'Gentle',
    version: 2,
    dueAt: t0,
    phaseEnteredAt: t0,
    phaseDeadline: t0 + 2 * 60_000,
    remainingMs: 2 * 60_000,
    ...overrides,
  };
}

describe('InterventionWindowApp (ROUTINE-4104)', () => {
  let projectionListener: ((payload: unknown) => void) | null = null;
  const invoke = vi.fn();
  const off = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(t0);
    projectionListener = null;
    invoke.mockReset().mockImplementation(async (channel: string, _command?: unknown) => {
      if (channel === RoutineWindowChannels.INTERVENTION_WINDOW_GET) return ok(gentleProjection());
      if (channel === RoutineWindowChannels.INTERVENTION_WINDOW_COMMAND) {
        return ok(gentleProjection());
      }
      throw new Error(`unexpected channel ${channel}`);
    });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        invoke,
        on: vi.fn((channel: string, callback: (payload: unknown) => void) => {
          if (channel === RoutineWindowChannels.INTERVENTION_WINDOW_PROJECTION) {
            projectionListener = callback;
          }
        }),
        off,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as { electronAPI?: unknown }).electronAPI;
  });

  it('renders Gentle/Guided from Main projection and local countdown never advances runtime', async () => {
    const wrapper = mount(InterventionWindowApp);
    await vi.waitFor(() => expect(wrapper.text()).toContain('A pause is coming'));
    expect(wrapper.get('[data-testid="intervention-countdown"]').text()).toBe('02:00');

    vi.advanceTimersByTime(61_000);
    await nextTick();
    expect(wrapper.get('[data-testid="intervention-countdown"]').text()).toBe('00:59');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(RoutineWindowChannels.INTERVENTION_WINDOW_GET);

    projectionListener?.(
      gentleProjection({
        state: 'Guided',
        version: 4,
        phaseEnteredAt: t0 + 5 * 60_000,
        phaseDeadline: null,
        remainingMs: null,
      }),
    );
    await nextTick();
    expect(wrapper.classes()).toContain('is-guided');
    expect(wrapper.text()).toContain('Guided break');
    expect(wrapper.text()).toContain('Take the break now');
    expect(wrapper.find('[data-testid="intervention-countdown"]').exists()).toBe(false);

    wrapper.unmount();
    expect(off).toHaveBeenCalledWith(
      RoutineWindowChannels.INTERVENTION_WINDOW_PROJECTION,
      expect.any(Function),
    );
  });

  it('routes complete, snooze, and dismiss through the minimal Main Process IPC surface', async () => {
    const wrapper = mount(InterventionWindowApp);
    await vi.waitFor(() => expect(wrapper.text()).toContain('A pause is coming'));
    let buttons = wrapper.findAll('button');
    await buttons[0]!.trigger('click');
    buttons = wrapper.findAll('button');
    await buttons[1]!.trigger('click');
    await wrapper.get('button[aria-label="Dismiss intervention"]').trigger('click');

    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith(RoutineWindowChannels.INTERVENTION_WINDOW_COMMAND, {
        action: 'complete',
      });
      expect(invoke).toHaveBeenCalledWith(RoutineWindowChannels.INTERVENTION_WINDOW_COMMAND, {
        action: 'snooze',
        durationMs: 300_000,
      });
      expect(invoke).toHaveBeenCalledWith(RoutineWindowChannels.INTERVENTION_WINDOW_COMMAND, {
        action: 'dismiss',
      });
    });
    wrapper.unmount();
  });
});
