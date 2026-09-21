/** @vitest-environment happy-dom */

import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { RoutineClientPort } from '@memoflow/reminder/client';
import { ROUTINE_SERVICE_KEY } from '../../../di/keys';
import RoutineUpcomingWidget from './RoutineUpcomingWidget.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      routine: { home: { title: 'Today routines', viewAll: 'View all', empty: 'None' } },
    },
  },
});

describe('RoutineUpcomingWidget', () => {
  afterEach(() => vi.useRealTimers());

  it('loads owner-backed remaining WallClock occurrences and never uses Reminder transport', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T08:00:00.000Z'));
    const getUpcomingOccurrences = vi.fn().mockResolvedValue(
      ok({
        occurrences: [
          {
            identityId: 'identity-1',
            routineId: 'routine-1',
            occurrenceKey: 'routine:routine-1:oc:1',
            title: 'Drink water',
            description: 'Hydrate',
            occurrenceAt: Date.parse('2026-09-21T09:30:00.000Z'),
            endAt: null,
            revision: 1,
            editable: false as const,
          },
        ],
      }),
    );
    const service = { getUpcomingOccurrences } as unknown as RoutineClientPort;

    const wrapper = mount(RoutineUpcomingWidget, {
      props: { active: true },
      global: {
        plugins: [i18n],
        provide: { [ROUTINE_SERVICE_KEY as symbol]: service },
      },
    });
    await vi.waitFor(() => expect(getUpcomingOccurrences).toHaveBeenCalledOnce());

    const query = getUpcomingOccurrences.mock.calls[0]?.[0];
    expect(query.start).toBe(Date.parse('2026-09-21T08:00:00.000Z'));
    expect(query.end).toBeGreaterThan(query.start);
    expect(wrapper.text()).toContain('Drink water');
    expect(wrapper.text()).toContain('Hydrate');
  });
});
