import { ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import { createServerStateRuntime } from '../../../platform/server-state';
import { mountTaskComposable } from './taskQueryTestUtils';
import { useTaskPlanListQuery } from './useTaskPlanListQuery';
import { useTaskPlanDetailQuery } from './useTaskPlanDetailQuery';

function template(overrides: Partial<TaskPlanClientDTO> = {}): TaskPlanClientDTO {
  return {
    id: 'template-1' as TaskPlanClientDTO['id'],
    name: 'Write tests',
    status: 'Active',
    ...overrides,
  } as TaskPlanClientDTO;
}

function entity(dto: TaskPlanClientDTO) {
  return { toDTO: () => dto };
}

function makeService() {
  return {
    listPlans: vi.fn(),
    getPlan: vi.fn(),
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    deletePlan: vi.fn(),
    activatePlan: vi.fn(),
    pausePlan: vi.fn(),
    archivePlan: vi.fn(),
  };
}

describe('useTaskPlanListQuery', () => {
  afterEach(() => vi.useRealTimers());

  it('fetches the flat Task Plan list and dedupes same-key consumers', async () => {
    const service = makeService();
    service.listPlans.mockResolvedValue(ok({ plans: [entity(template())], total: 1 }));
    const runtime = createServerStateRuntime('web');
    const first = mountTaskComposable(() => useTaskPlanListQuery({ page: 1, limit: 20 }), {
      service,
      runtime,
    });
    const second = mountTaskComposable(() => useTaskPlanListQuery({ page: 1, limit: 20 }), {
      service,
      runtime,
    });

    await vi.waitFor(() => expect(first.api.isLoading.value).toBe(false));
    await vi.waitFor(() => expect(second.api.isLoading.value).toBe(false));
    expect(service.listPlans).toHaveBeenCalledTimes(1);
    expect(first.api.templates.value).toHaveLength(1);
    expect(first.api.total.value).toBe(1);
  });

  it('stays disabled on Today and automatically fetches the current filtered page on Plans', async () => {
    const service = makeService();
    service.listPlans.mockResolvedValue(ok({ plans: [], total: 123 }));
    const surface = ref('today');
    const page = ref(1);
    const { api } = mountTaskComposable(() => useTaskPlanListQuery({
      params: () => ({ page: page.value, limit: 100, outcome: ['Open'], archiveState: 'active', labelIdsAll: ['b', 'a'] }),
      enabled: () => surface.value === 'plans',
    }), { service });
    await flushPromises();
    page.value = 2;
    await flushPromises();
    expect(service.listPlans).not.toHaveBeenCalled();
    expect(api.query.fetchStatus.value).toBe('idle');

    surface.value = 'plans';
    await vi.waitFor(() => expect(api.isLoading.value).toBe(false));
    expect(service.listPlans).toHaveBeenCalledExactlyOnceWith({
      page: 2, limit: 100, outcome: ['Open'], archiveState: 'active', labelIdsAll: ['a', 'b'],
    });
    expect(api.total.value).toBe(123);

    surface.value = 'today';
    page.value = 3;
    await flushPromises();
    expect(service.listPlans).toHaveBeenCalledTimes(1);
    surface.value = 'plans';
    await vi.waitFor(() => expect(service.listPlans).toHaveBeenCalledTimes(2));
    expect(service.listPlans).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 }));
  });

  it('isolates the Task Plan list cache by identity scope', async () => {
    const service = makeService();
    service.listPlans.mockResolvedValue(ok({ plans: [], total: 0 }));
    const runtime = createServerStateRuntime('web');
    const a = mountTaskComposable(() => useTaskPlanListQuery({ page: 1, limit: 20 }), {
      service,
      runtime,
      identityScope: 'identity-a',
    });
    const b = mountTaskComposable(() => useTaskPlanListQuery({ page: 1, limit: 20 }), {
      service,
      runtime,
      identityScope: 'identity-b',
    });
    await vi.waitFor(() => expect(a.api.isLoading.value).toBe(false));
    await vi.waitFor(() => expect(b.api.isLoading.value).toBe(false));
    expect(service.listPlans).toHaveBeenCalledTimes(2);
  });
});

describe('useTaskPlanDetailQuery', () => {
  afterEach(() => vi.useRealTimers());

  it('stays disabled when the id is missing or "new"', async () => {
    const service = makeService();
    service.getPlan.mockResolvedValue(ok(entity(template())));
    const missing = mountTaskComposable(() => useTaskPlanDetailQuery(() => null), { service });
    const creating = mountTaskComposable(() => useTaskPlanDetailQuery(() => 'new'), { service });
    await Promise.resolve();
    expect(missing.api.currentTemplate.value).toBeNull();
    expect(creating.api.currentTemplate.value).toBeNull();
    expect(service.getPlan).not.toHaveBeenCalled();
  });

  it('fetches detail once for a stable id and isolates a different id', async () => {
    const service = makeService();
    service.getPlan.mockResolvedValue(ok(entity(template())));
    const first = mountTaskComposable(() => useTaskPlanDetailQuery(() => 'template-1'), { service });
    await vi.waitFor(() => expect(first.api.isLoading.value).toBe(false));
    expect(service.getPlan).toHaveBeenCalledTimes(1);
    expect(first.api.currentTemplate.value?.id).toBe('template-1');

    const second = mountTaskComposable(() => useTaskPlanDetailQuery(() => 'template-2'), {
      service,
      runtime: first.runtime,
    });
    await vi.waitFor(() => expect(second.api.isLoading.value).toBe(false));
    expect(service.getPlan).toHaveBeenCalledTimes(2);
  });
});
