/** @vitest-environment happy-dom */
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { GOAL_SERVICE_KEY, ROUTINE_SERVICE_KEY } from '../../../di/keys';
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
  type ServerStateRuntime,
} from '../../../platform/server-state';

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

vi.mock('../../task/composables/useTask', () => ({
  useTask: () => ({
    instances: taskInstances,
    templates: taskTemplates,
    isLoading: ref(false),
    fetchInstancesByDateRange,
    fetchTemplates,
  }),
}));

import { useCalendarView } from './useCalendarView';

function mountCalendar(
  runtime: ServerStateRuntime,
  goalService: { listGoals: ReturnType<typeof vi.fn> },
  routineService: { getUpcomingOccurrences: ReturnType<typeof vi.fn> },
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
        [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: () => 'identity-1',
      },
    },
  });
  return { wrapper, api };
}

describe('useCalendarView Planner owner cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calendarEntries.value = [];
    taskInstances.value = [];
    taskTemplates.value = [];
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
              toDTO: () => ({
                id: 'goal',
                identityId: 'identity-1',
                name: 'Goal',
                status: 'InProgress',
                start: { kind: 'day', date: '2026-09-28' },
                target: null,
                version: 3,
              }),
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
});
