import { ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import { createTestServerStateRuntime } from '../../../platform/server-state';
import { taskPlanQueryKeys } from '../../../platform/server-state/query-keys';
import { startOfDayMs, endOfDayMs } from '../../../shared/utils/product-time';
import { mountTaskComposable } from './taskQueryTestUtils';
import { useTaskToday } from './useTaskToday';

vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function occurrence(id: string, planId: string, dueAt = Date.now(), status = 'Pending') {
  return { id, planId, dueAt, status, isOverdue: false } as TaskOccurrenceClientDTO;
}
function plan(id: string) {
  return { id, name: `Plan ${id}` } as TaskPlanClientDTO;
}
function entity<T>(dto: T) {
  return { toDTO: () => dto };
}
function service() {
  return {
    listPlans: vi.fn(),
    listOccurrencesByDateRange: vi
      .fn()
      .mockResolvedValue(
        ok([
          entity(occurrence('a', 'outside-page')),
          entity(occurrence('b', 'outside-page')),
          entity(occurrence('overdue', 'older-plan', startOfDayMs(Date.now()) - 1)),
        ]),
      ),
    getPlan: vi.fn(async (id: string) => ok(entity(plan(id)))),
  };
}

describe('canonical Task Today projection', () => {
  afterEach(() => vi.useRealTimers());

  it('shares bounded day + overdue reads and distinct referenced details across quick hosts, never a Plan list', async () => {
    const owner = service();
    const runtime = createTestServerStateRuntime();
    const first = mountTaskComposable(useTaskToday, { service: owner, runtime });
    const second = mountTaskComposable(useTaskToday, { service: owner, runtime });
    await Promise.all([first.api.load(), second.api.load()]);
    expect(owner.listOccurrencesByDateRange).toHaveBeenCalledExactlyOnceWith(
      startOfDayMs(Date.now()),
      endOfDayMs(Date.now()),
      { includeOverdueOpen: true },
    );
    expect(owner.listPlans).not.toHaveBeenCalled();
    expect(owner.getPlan.mock.calls.map(([id]) => id).sort()).toEqual([
      'older-plan',
      'outside-page',
    ]);
    expect(first.api.templates.value.map((item) => item.id)).toEqual([
      'outside-page',
      'older-plan',
    ]);
    expect(first.api.instances.value.map((item) => item.id)).toContain('overdue');
    expect(
      runtime.queryClient.getQueryData(taskPlanQueryKeys.detail('identity-1', 'outside-page')),
    ).toEqual(plan('outside-page'));
    await second.api.load();
    expect(owner.listOccurrencesByDateRange).toHaveBeenCalledTimes(1);
    expect(owner.getPlan).toHaveBeenCalledTimes(2);
    await first.api.load(true);
    expect(owner.listOccurrencesByDateRange).toHaveBeenCalledTimes(2);
    expect(owner.getPlan).toHaveBeenCalledTimes(4);
  });

  it('excludes completed overdue and future facts if another store consumer changes the range', async () => {
    const owner = service();
    owner.listOccurrencesByDateRange.mockResolvedValue(
      ok([
        entity(occurrence('today', 'p')),
        entity(occurrence('completed-old', 'p', startOfDayMs(Date.now()) - 1, 'Completed')),
        entity(occurrence('future', 'p', endOfDayMs(Date.now()) + 1)),
      ]),
    );
    const { api } = mountTaskComposable(useTaskToday, { service: owner });
    await api.load();
    expect(api.instances.value.map((item) => item.id)).toEqual(['today']);
  });

  it('surfaces referenced-Plan failure and retries without resurrecting the capped list', async () => {
    const owner = service();
    owner.getPlan.mockRejectedValueOnce(new Error('offline'));
    const { api } = mountTaskComposable(useTaskToday, { service: owner });
    await api.load();
    expect(api.error.value).toBe('Could not load task templates');
    expect(api.isLoading.value).toBe(false);
    await api.load(true);
    expect(api.error.value).toBeNull();
    expect(api.templates.value).toHaveLength(2);
    expect(owner.listPlans).not.toHaveBeenCalled();
  });

  it('suppresses pending old identity details after scope change', async () => {
    const owner = service();
    let release!: (value: Awaited<ReturnType<typeof owner.getPlan>>) => void;
    owner.getPlan.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    owner.listOccurrencesByDateRange.mockResolvedValue(ok([entity(occurrence('a', 'p'))]));
    const identity = ref('identity-a');
    const { api } = mountTaskComposable(useTaskToday, {
      service: owner,
      identityScope: () => identity.value,
    });
    const loading = api.load();
    await flushPromises();
    identity.value = 'identity-b';
    await flushPromises();
    release(ok(entity(plan('p'))));
    await loading;
    expect(api.templates.value).toEqual([]);
    expect(api.isLoading.value).toBe(false);
  });
});
