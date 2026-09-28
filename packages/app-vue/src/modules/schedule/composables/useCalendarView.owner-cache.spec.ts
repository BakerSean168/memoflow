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
});
