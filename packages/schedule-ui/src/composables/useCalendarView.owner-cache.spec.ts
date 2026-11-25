/** @vitest-environment happy-dom */
import { defineComponent, h, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts/result';
import { GOAL_SERVICE_KEY, ROUTINE_SERVICE_KEY } from '@schedule-ui-test-host/di/keys';
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
  type ServerStateRuntime,
} from '@schedule-ui-test-host/platform/server-state/index.ts';

const calendarEntries = ref([]);
const taskInstances = ref([]);
const taskTemplates = ref([]);
const fetchCalendarEntries = vi.fn().mockResolvedValue(undefined);
const fetchInstancesByDateRange = vi.fn().mockResolvedValue(undefined);
const fetchTemplates = vi.fn().mockResolvedValue(undefined);

vi.mock('./useSchedule', () => ({
  useSchedule: () => ({
    calendarEntries,
    isLoading: ref(false),
    fetchCalendarEntries,
  }),
}));

import { useCalendarView } from './useCalendarView';
import { bindScheduleUiHost } from '../schedule-ui-host';
import { createScheduleUiTestHost } from '../test/test-host';

function mountCalendar(
  runtime: ServerStateRuntime,
  goalService: { listGoals: ReturnType<typeof vi.fn> },
  routineService: { getUpcomingOccurrences: ReturnType<typeof vi.fn> },
  identityScope = 'identity-1',
) {
  let api!: ReturnType<typeof useCalendarView>;
  const Host = defineComponent({
    setup() {
      api = useCalendarView();
      return () => h('div');
    },
  });
  const wrapper = mount(Host, {
    global: {
      provide: {
        [GOAL_SERVICE_KEY as symbol]: goalService,
        [ROUTINE_SERVICE_KEY as symbol]: routineService,
        [SERVER_STATE_RUNTIME_KEY as symbol]: runtime,
        [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: () => identityScope,
      },
    },
  });
  return { wrapper, api };
}

function routineOccurrence(occurrenceAt: number, revision = 1) {
  return {
    identityId: 'identity-1',
    routineId: 'routine-1',
    occurrenceKey: 'routine-1:wall-clock',
    title: 'Wind down',
    description: null,
    editable: false,
    occurrenceAt,
    endAt: null,
    revision,
  };
}

function routineStartTimes(api: ReturnType<typeof useCalendarView>): number[] {
  return api.projections.value
    .filter((projection) => projection.sourceType === 'routine')
    .map((projection) => Number(projection.start));
}

describe('useCalendarView Planner owner cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calendarEntries.value = [];
    taskInstances.value = [];
    taskTemplates.value = [];
    bindScheduleUiHost(
      createScheduleUiTestHost({
        useTask: () =>
          ({
            instances: taskInstances,
            templates: taskTemplates,
            isLoading: ref(false),
            fetchInstancesByDateRange,
            fetchTemplates,
          }) as never,
      }),
    );
  });

  it('does not re-request Goal/Routine owner reads when the shell consumer remounts', async () => {
    const runtime = createTestServerStateRuntime();
    const goalService = {
      listGoals: vi.fn().mockResolvedValue(
        ok({
          goals: [],
          pagination: { page: 1, pageSize: 100, total: 0, hasMore: false },
        }),
      ),
    };
    const routineService = {
      getUpcomingOccurrences: vi.fn().mockResolvedValue(ok({ occurrences: [] })),
    };
    const now = Date.UTC(2026, 8, 28, 10, 0);

    const first = mountCalendar(runtime, goalService, routineService);
    await first.api.ensureTodayLoaded(now);
    expect(goalService.listGoals).toHaveBeenCalledTimes(1);
    expect(routineService.getUpcomingOccurrences).toHaveBeenCalledTimes(1);
    first.wrapper.unmount();

    const second = mountCalendar(runtime, goalService, routineService);
    await second.api.ensureTodayLoaded(now);
    expect(goalService.listGoals).toHaveBeenCalledTimes(1);
    expect(routineService.getUpcomingOccurrences).toHaveBeenCalledTimes(1);

    second.wrapper.unmount();
    runtime.dispose();
  });
  it('forces canonical Schedule/Task/Goal/Routine reads after a stale owner outcome', async () => {
    const runtime = createTestServerStateRuntime();
    const goalService = {
      listGoals: vi.fn().mockResolvedValue(ok({ goals: [], pagination: { hasMore: false } })),
    };
    const routineService = {
      getUpcomingOccurrences: vi.fn().mockResolvedValue(ok({ occurrences: [] })),
    };
    const { wrapper, api } = mountCalendar(runtime, goalService, routineService);
    const start = Date.UTC(2026, 8, 28);
    const end = Date.UTC(2026, 8, 29);
    await api.fetchForRange(start, end);
    await api.fetchForRange(start, end, { force: true });
    expect(fetchCalendarEntries).toHaveBeenLastCalledWith(start, end, { force: true });
    expect(fetchInstancesByDateRange).toHaveBeenLastCalledWith(start, end, { force: true });
    expect(goalService.listGoals).toHaveBeenCalledTimes(2);
    expect(routineService.getUpcomingOccurrences).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    runtime.dispose();
  });
  it('retains loaded marker projections when forced canonical reads fail, then accepts an authoritative empty result', async () => {
    const runtime = createTestServerStateRuntime();
    const goalService = {
      listGoals: vi.fn().mockResolvedValue(
        ok({
          goals: [
            {
              id: 'goal',
              identityId: 'identity-1',
              name: 'Goal',
              status: 'InProgress',
              start: { kind: 'day', date: '2026-09-28' },
              target: null,
              version: 3,
            },
          ],
          pagination: { hasMore: false },
        }),
      ),
    };
    const routineService = {
      getUpcomingOccurrences: vi.fn().mockResolvedValue(
        ok({
          occurrences: [
            {
              identityId: 'identity-1',
              routineId: 'routine',
              occurrenceKey: 'routine-1',
              title: 'Routine',
              description: null,
              editable: false,
              occurrenceAt: Date.UTC(2026, 8, 28, 12),
              endAt: null,
              revision: 2,
            },
          ],
        }),
      ),
    };
    const { wrapper, api } = mountCalendar(runtime, goalService, routineService);
    const start = Date.UTC(2026, 8, 28);
    const end = Date.UTC(2026, 8, 29);
    await api.fetchForRange(start, end);
    const before = structuredClone(api.projections.value);
    expect(before.map((p) => p.sourceType)).toEqual(['goal', 'routine']);
    goalService.listGoals.mockRejectedValueOnce(new Error('offline'));
    routineService.getUpcomingOccurrences.mockRejectedValueOnce(new Error('offline'));
    const refreshed = await Promise.allSettled([api.fetchForRange(start, end, { force: true })]);
    expect(api.projections.value).toEqual(before);
    expect(refreshed[0]?.status).toBe('rejected');
    goalService.listGoals.mockResolvedValueOnce(ok({ goals: [], pagination: { hasMore: false } }));
    routineService.getUpcomingOccurrences.mockResolvedValueOnce(ok({ occurrences: [] }));
    await api.fetchForRange(start, end, { force: true });
    expect(api.projections.value).toEqual([]);
    wrapper.unmount();
    runtime.dispose();
  });

  it('refreshes an already-mounted Planner range when a committed Routine mutation invalidates it', async () => {
    const runtime = createTestServerStateRuntime();
    const goalService = {
      listGoals: vi.fn().mockResolvedValue(ok({ goals: [], pagination: { hasMore: false } })),
    };
    const occurrenceAt = ref(Date.UTC(2026, 8, 28, 23, 50));
    const routineService = {
      getUpcomingOccurrences: vi.fn(async () =>
        ok({ occurrences: [routineOccurrence(occurrenceAt.value)] }),
      ),
    };
    const { wrapper, api } = mountCalendar(runtime, goalService, routineService);
    const start = Date.UTC(2026, 8, 28);
    const end = Date.UTC(2026, 8, 29);

    await api.fetchForRange(start, end);
    expect(routineStartTimes(api)).toEqual([occurrenceAt.value]);

    // Config edit 23:50 → 23:30 while the Planner stays mounted inside the 30s stale window.
    occurrenceAt.value = Date.UTC(2026, 8, 28, 23, 30);
    await runtime.dispatcher.invalidate({
      target: 'routine-upcoming',
      identityScope: 'identity-1',
      source: 'mutation',
    });

    await vi.waitFor(() => expect(routineStartTimes(api)).toEqual([occurrenceAt.value]));
    expect(routineService.getUpcomingOccurrences).toHaveBeenCalledTimes(2);
    expect(api.ownerReadError.value).toBeNull();

    // Re-entering the same range keeps reading the new projection without a restart.
    await api.fetchForRange(start, end);
    expect(routineStartTimes(api)).toEqual([occurrenceAt.value]);
    expect(routineService.getUpcomingOccurrences).toHaveBeenCalledTimes(2);

    wrapper.unmount();
    runtime.dispose();
  });

  it('ignores a Routine invalidation for another identity', async () => {
    const runtime = createTestServerStateRuntime();
    const goalService = {
      listGoals: vi.fn().mockResolvedValue(ok({ goals: [], pagination: { hasMore: false } })),
    };
    const routineService = {
      getUpcomingOccurrences: vi
        .fn()
        .mockResolvedValue(ok({ occurrences: [routineOccurrence(Date.UTC(2026, 8, 28, 23, 50))] })),
    };
    const { wrapper, api } = mountCalendar(runtime, goalService, routineService);
    await api.fetchForRange(Date.UTC(2026, 8, 28), Date.UTC(2026, 8, 29));

    await runtime.dispatcher.invalidate({
      target: 'routine-upcoming',
      identityScope: 'identity-2',
      source: 'mutation',
    });
    await flushPromises();

    expect(routineService.getUpcomingOccurrences).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    runtime.dispose();
  });

  it('keeps the current marker data and reports a failed owner refresh', async () => {
    const runtime = createTestServerStateRuntime();
    const goalService = {
      listGoals: vi.fn().mockResolvedValue(ok({ goals: [], pagination: { hasMore: false } })),
    };
    const original = Date.UTC(2026, 8, 28, 23, 50);
    const routineService = {
      getUpcomingOccurrences: vi
        .fn()
        .mockResolvedValueOnce(ok({ occurrences: [routineOccurrence(original)] })),
    };
    const { wrapper, api } = mountCalendar(runtime, goalService, routineService);
    await api.fetchForRange(Date.UTC(2026, 8, 28), Date.UTC(2026, 8, 29));

    routineService.getUpcomingOccurrences.mockRejectedValueOnce(new Error('offline'));
    await runtime.dispatcher.invalidate({
      target: 'routine-upcoming',
      identityScope: 'identity-1',
      source: 'powersync',
    });

    await vi.waitFor(() => expect(api.ownerReadError.value).not.toBeNull());
    expect(routineStartTimes(api)).toEqual([original]);
    wrapper.unmount();
    runtime.dispose();
  });

  it('never lets a superseded Routine read overwrite the current range', async () => {
    const runtime = createTestServerStateRuntime();
    const goalService = {
      listGoals: vi.fn().mockResolvedValue(ok({ goals: [], pagination: { hasMore: false } })),
    };
    const stale = Date.UTC(2026, 8, 28, 23, 50);
    const fresh = Date.UTC(2026, 8, 29, 0, 10);
    let releaseStale!: () => void;
    const routineService = {
      getUpcomingOccurrences: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releaseStale = () => resolve(ok({ occurrences: [routineOccurrence(stale)] }));
            }),
        )
        .mockImplementation(async () => ok({ occurrences: [routineOccurrence(fresh)] })),
    };
    const { wrapper, api } = mountCalendar(runtime, goalService, routineService);

    const staleRead = api.fetchForRange(Date.UTC(2026, 8, 28), Date.UTC(2026, 8, 29));
    await api.fetchForRange(Date.UTC(2026, 8, 29), Date.UTC(2026, 8, 30));
    expect(routineStartTimes(api)).toEqual([fresh]);

    releaseStale();
    await staleRead;
    await flushPromises();
    expect(routineStartTimes(api)).toEqual([fresh]);

    wrapper.unmount();
    runtime.dispose();
  });
});
