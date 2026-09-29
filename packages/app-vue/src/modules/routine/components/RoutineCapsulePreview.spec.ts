/** @vitest-environment jsdom */
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTINE_SERVICE_KEY } from '../../../di/keys';
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
} from '../../../platform/server-state';
import RoutineCapsulePreview from './RoutineCapsulePreview.vue';

const getUpcomingOccurrences = vi.fn();
const setTemporaryOverride = vi.fn();

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { retry: 'Retry' },
      routine: {
        title: 'Routine',
        home: { title: 'Next up', empty: 'Nothing else today', viewAll: 'View all' },
        card: { snooze30: 'Snooze 30m' },
      },
    },
  },
});

let runtime: ReturnType<typeof createTestServerStateRuntime>;

function mountPreview() {
  return mount(RoutineCapsulePreview, {
    global: {
      plugins: [i18n],
      provide: {
        [ROUTINE_SERVICE_KEY as symbol]: {
          getUpcomingOccurrences,
          setTemporaryOverride,
        },
        [SERVER_STATE_RUNTIME_KEY as symbol]: runtime,
        [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: () => 'identity-1',
      },
    },
  });
}

describe('RoutineCapsulePreview quick workspace', () => {
  beforeEach(() => {
    runtime = createTestServerStateRuntime();
  });

  afterEach(() => {
    runtime.dispose();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows owner-projected upcoming routine occurrences instead of configuration counts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T09:00:00Z'));
    getUpcomingOccurrences.mockResolvedValue({
      ok: true,
      data: {
        occurrences: [
          {
            identityId: 'identity-1',
            routineId: 'routine-1',
            occurrenceKey: 'routine-1:2026-09-28T10:00',
            title: 'Stand and move',
            description: 'Walk for two minutes',
            occurrenceAt: Date.parse('2026-09-28T10:00:00Z'),
            endAt: null,
            revision: 1,
            editable: false,
          },
        ],
      },
    });

    const wrapper = mountPreview();
    await flushPromises();

    expect(getUpcomingOccurrences).toHaveBeenCalled();
    expect(wrapper.get('[data-testid="routine-capsule-occurrence"]').text()).toContain(
      'Stand and move',
    );
    expect(wrapper.text()).not.toContain('Profile');

    await wrapper.get('[data-testid="routine-capsule-open-routine-1"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['routine-1']]);
    wrapper.unmount();

    const reopened = mountPreview();
    await flushPromises();
    expect(getUpcomingOccurrences).toHaveBeenCalledTimes(1);
    reopened.unmount();
  });

  it('snoozes a Routine directly for 30 minutes and refreshes the quick workspace', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T09:00:00Z'));
    getUpcomingOccurrences.mockResolvedValue({
      ok: true,
      data: {
        occurrences: [
          {
            identityId: 'identity-1',
            routineId: 'routine-1',
            occurrenceKey: 'routine-1:2026-09-28T10:00',
            title: 'Stand and move',
            description: null,
            occurrenceAt: Date.parse('2026-09-28T10:00:00Z'),
            endAt: null,
            revision: 1,
            editable: false,
          },
        ],
      },
    });
    setTemporaryOverride.mockResolvedValue({ ok: true, data: {} });

    const wrapper = mountPreview();
    await flushPromises();
    await wrapper.get('[title="Snooze 30m"]').trigger('click');
    await flushPromises();

    const expectedUntil = Date.parse('2026-09-28T09:30:00Z');
    expect(setTemporaryOverride).toHaveBeenCalledWith(
      'routine-1',
      expect.objectContaining({
        snoozeUntil: expectedUntil,
        expiresAt: expectedUntil,
        source: 'user',
      }),
    );
    expect(getUpcomingOccurrences).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
