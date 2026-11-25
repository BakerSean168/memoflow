/** @vitest-environment happy-dom */

import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import type { RoutineClientPort } from '@memoflow/routine-client';
import { ROUTINE_SERVICE_KEY } from '@routine-ui-test-host/di/keys';
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
} from '@routine-ui-test-host/platform/server-state';
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

function mountWidget(service: RoutineClientPort, runtime = createTestServerStateRuntime()) {
  return mount(RoutineUpcomingWidget, {
    props: { active: true },
    global: {
      plugins: [i18n],
      provide: {
        [ROUTINE_SERVICE_KEY as symbol]: service,
        [SERVER_STATE_RUNTIME_KEY as symbol]: runtime,
        [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: () => 'identity-1',
      },
    },
  });
}

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

    const runtime = createTestServerStateRuntime();
    const wrapper = mountWidget(service, runtime);
    await vi.waitFor(() => expect(getUpcomingOccurrences).toHaveBeenCalledOnce());

    const query = getUpcomingOccurrences.mock.calls[0]?.[0];
    expect(query.start).toBe(Date.parse('2026-09-21T08:00:00.000Z'));
    expect(query.end).toBeGreaterThan(query.start);
    expect(wrapper.text()).toContain('Drink water');
    expect(wrapper.text()).toContain('Hydrate');
    wrapper.unmount();
    runtime.dispose();
  });

  it('reloads after a committed Routine mutation invalidates the owner projection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T08:00:00.000Z'));
    const getUpcomingOccurrences = vi
      .fn()
      .mockResolvedValueOnce(
        ok({
          occurrences: [
            {
              identityId: 'identity-1',
              routineId: 'routine-1',
              occurrenceKey: 'routine:routine-1:old',
              title: 'Wind down 23:50',
              description: null,
              occurrenceAt: Date.parse('2026-09-21T09:30:00.000Z'),
              endAt: null,
              revision: 1,
              editable: false,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        ok({
          occurrences: [
            {
              identityId: 'identity-1',
              routineId: 'routine-1',
              occurrenceKey: 'routine:routine-1:new',
              title: 'Wind down 23:30',
              description: null,
              occurrenceAt: Date.parse('2026-09-21T09:30:00.000Z'),
              endAt: null,
              revision: 2,
              editable: false,
            },
          ],
        }),
      );
    const service = { getUpcomingOccurrences } as unknown as RoutineClientPort;

    const runtime = createTestServerStateRuntime();
    const wrapper = mountWidget(service, runtime);
    await flushPromises();
    expect(wrapper.text()).toContain('Wind down 23:50');

    await runtime.dispatcher.invalidate({
      target: 'routine-upcoming',
      identityScope: 'identity-1',
      source: 'powersync',
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Wind down 23:30');
    expect(wrapper.text()).not.toContain('Wind down 23:50');
    expect(getUpcomingOccurrences).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    runtime.dispose();
  });
});
