import { beforeEach, describe, expect, it } from 'vitest';
import type { CalendarEntryClientDTO } from '@memoflow/contracts/schedule';
import { createTestPinia } from '@memoflow/test-utils';
import { useScheduleStore } from './schedule-store';

describe('useScheduleStore', () => {
  beforeEach(() => {
    createTestPinia();
  });

  it('owns only Planner/Calendar state and common status flags', () => {
    const store = useScheduleStore();
    const entry = { id: 'entry-1' } as CalendarEntryClientDTO;

    store.setCalendarEntries([entry]);
    store.setLoading(true);
    store.setError('failed');
    store.setInitialized(true);

    expect(store.calendarEntries).toEqual([entry]);
    expect(store.isLoading).toBe(true);
    expect(store.error).toBe('failed');
    expect(store.isInitialized).toBe(true);
    expect('tasks' in store).toBe(false);
    expect('currentTask' in store).toBe(false);
    expect('executions' in store).toBe(false);

    store.reset();
    expect(store.calendarEntries).toEqual([]);
    expect(store.isInitialized).toBe(false);
  });
});
