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
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    activateTemplate: vi.fn(),
    pauseTemplate: vi.fn(),
    archiveTemplate: vi.fn(),
  };
}

describe('useTaskPlanListQuery', () => {
  afterEach(() => vi.useRealTimers());

  it('fetches the flat Task Plan list and dedupes same-key consumers', async () => {
    const service = makeService();
    service.listTemplates.mockResolvedValue(ok({ templates: [entity(template())], total: 1 }));
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
    expect(service.listTemplates).toHaveBeenCalledTimes(1);
    expect(first.api.templates.value).toHaveLength(1);
    expect(first.api.total.value).toBe(1);
  });

  it('isolates the Task Plan list cache by identity scope', async () => {
    const service = makeService();
    service.listTemplates.mockResolvedValue(ok({ templates: [], total: 0 }));
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
    expect(service.listTemplates).toHaveBeenCalledTimes(2);
  });
});

describe('useTaskPlanDetailQuery', () => {
  afterEach(() => vi.useRealTimers());

  it('stays disabled when the id is missing or "new"', async () => {
    const service = makeService();
    service.getTemplate.mockResolvedValue(ok(entity(template())));
    const missing = mountTaskComposable(() => useTaskPlanDetailQuery(() => null), { service });
    const creating = mountTaskComposable(() => useTaskPlanDetailQuery(() => 'new'), { service });
    await Promise.resolve();
    expect(missing.api.currentTemplate.value).toBeNull();
    expect(creating.api.currentTemplate.value).toBeNull();
    expect(service.getTemplate).not.toHaveBeenCalled();
  });

  it('fetches detail once for a stable id and isolates a different id', async () => {
    const service = makeService();
    service.getTemplate.mockResolvedValue(ok(entity(template())));
    const first = mountTaskComposable(() => useTaskPlanDetailQuery(() => 'template-1'), { service });
    await vi.waitFor(() => expect(first.api.isLoading.value).toBe(false));
    expect(service.getTemplate).toHaveBeenCalledTimes(1);
    expect(first.api.currentTemplate.value?.id).toBe('template-1');

    const second = mountTaskComposable(() => useTaskPlanDetailQuery(() => 'template-2'), {
      service,
      runtime: first.runtime,
    });
    await vi.waitFor(() => expect(second.api.isLoading.value).toBe(false));
    expect(service.getTemplate).toHaveBeenCalledTimes(2);
  });
});
