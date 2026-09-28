/** @vitest-environment happy-dom */
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { createTestPinia } from '@memoflow/test-utils';
import { SCHEDULE_SERVICE_KEY } from '../../../di/keys';
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
  type ServerStateRuntime,
} from '../../../platform/server-state';
import { useSchedule } from './useSchedule';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      schedule: { error: { loadCalendarEntriesFailed: 'Failed to load schedules' } },
    },
  },
});

function scheduleEntry() {
  return {
    id: 'schedule-1',
    identityId: 'identity-1',
    title: 'Cached schedule',
    description: null,
    range: {
      kind: 'Timed',
      start: Date.UTC(2026, 8, 28, 10, 0),
      end: Date.UTC(2026, 8, 28, 11, 0),
    },
    priority: 0,
    status: 'Active',
    version: 1,
    createdAt: Date.UTC(2026, 8, 1),
    updatedAt: Date.UTC(2026, 8, 1),
  };
}

function mountSchedule(
  runtime: ServerStateRuntime,
  pinia: ReturnType<typeof createTestPinia>,
  service: { getSchedulesByAccount: ReturnType<typeof vi.fn> },
) {
  let api!: ReturnType<typeof useSchedule>;
  const Host = defineComponent({
    setup() {
      api = useSchedule();
      return () => h('div');
    },
  });

  const wrapper = mount(Host, {
    global: {
      plugins: [pinia, i18n],
      provide: {
        [SCHEDULE_SERVICE_KEY as symbol]: service,
        [SERVER_STATE_RUNTIME_KEY as symbol]: runtime,
        [SERVER_STATE_IDENTITY_SCOPE_KEY as symbol]: () => 'identity-1',
      },
    },
  });
  return { wrapper, api };
}

describe('useScheduleCalendar shared owner cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses the fresh account schedule read after the consumer is unmounted and remounted', async () => {
    const runtime = createTestServerStateRuntime();
    const pinia = createTestPinia();
    const service = {
      getSchedulesByAccount: vi.fn().mockResolvedValue(ok([scheduleEntry()])),
    };
    const start = Date.UTC(2026, 8, 28, 0, 0);
    const end = Date.UTC(2026, 8, 29, 0, 0);

    const first = mountSchedule(runtime, pinia, service);
    await first.api.fetchCalendarEntries(start, end);
    expect(service.getSchedulesByAccount).toHaveBeenCalledTimes(1);
    first.wrapper.unmount();

    const second = mountSchedule(runtime, pinia, service);
    await second.api.fetchCalendarEntries(start, end);
    expect(service.getSchedulesByAccount).toHaveBeenCalledTimes(1);
    expect(second.api.calendarEntries.value).toHaveLength(1);

    second.wrapper.unmount();
    runtime.dispose();
  });
});
