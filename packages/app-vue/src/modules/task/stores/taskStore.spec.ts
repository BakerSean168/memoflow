import { beforeEach, describe, expect, it } from 'vitest';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import type { TaskOccurrenceId, TaskPlanId } from '@memoflow/contracts/primitives';
import { createTestPinia } from '@memoflow/test-utils';
import { useTaskStore } from './task-store';

function createInstance(overrides: Partial<TaskOccurrenceClientDTO> = {}): TaskOccurrenceClientDTO {
  return {
    id: 'instance-1' as TaskOccurrenceId,
    templateId: 'template-1' as TaskPlanId,
    status: 'Pending',
    ...overrides,
  } as TaskOccurrenceClientDTO;
}

describe('useTaskStore (instances/currentInstance + UI state; templates in query cache)', () => {
  beforeEach(() => {
    createTestPinia();
  });

  it('manages instances, current instance, and UI pagination/loading/error state', () => {
    const store = useTaskStore();
    const instance = createInstance();
    const updated = createInstance({
      id: instance.id,
      status: 'Completed',
    });

    store.setInstances([instance]);
    store.setCurrentInstance(instance);
    store.addInstance(createInstance({ id: 'instance-2' as TaskOccurrenceClientDTO['id'] }));
    store.updateInstance(updated);
    store.setLoading(true);
    store.setError('failed');
    store.setPage(3);
    store.setInitialized(true);

    expect(store.getInstanceById(instance.id)?.status).toBe('Completed');
    expect(store.currentInstance?.status).toBe('Completed');
    expect(store.pagination.page).toBe(3);
    expect(store.isLoading).toBe(true);
    expect(store.error).toBe('failed');
    expect(store.isInitialized).toBe(true);

    store.removeInstance(instance.id);
    expect(store.getInstanceById(instance.id)).toBeUndefined();

    store.reset();
    expect(store.instances).toEqual([]);
    expect(store.currentInstance).toBeNull();
    expect(store.pagination.page).toBe(1);
    expect(store.isInitialized).toBe(false);
  });

  it('holds no template / graph / dependency server DTO or template total', () => {
    const store = useTaskStore();
    expect(store).not.toHaveProperty('templates');
    expect(store).not.toHaveProperty('currentTemplate');
    expect(store).not.toHaveProperty('dependencies');
    expect(store.pagination).not.toHaveProperty('total');
  });
});
