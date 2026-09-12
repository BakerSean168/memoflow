import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import { createTestPinia } from '@memoflow/test-utils';
import { TASK_SERVICE_KEY } from '../../../di/keys';
import {
  createTestServerStateRuntime,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
  SERVER_STATE_RUNTIME_KEY,
} from '../../../platform/server-state';
import { taskPlanQueryKeys } from '../../../platform/server-state/query-keys';
import { useTaskStore } from '../stores/task-store';
import { useTaskOccurrences } from './useTaskOccurrences';

vi.mock('vue-sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      errors: { unknown: 'Unknown error' },
      task: {
        error: {
          operationFailed: 'Operation failed',
          completeFailed: 'Complete failed',
          completeSuccess: 'Completed',
          uncompleteFailed: 'Undo failed',
          uncompleteSuccess: 'Restored',
          markMissedFailed: 'Mark missed failed',
          markMissedSuccess: 'Marked missed',
          loadTemplatesFailed: 'Template refresh failed',
        },
      },
    },
  },
});

function instance(status: TaskOccurrenceClientDTO['status']): TaskOccurrenceClientDTO {
  return {
    id: 'instance-a',
    templateId: 'template-a',
    status,
  } as TaskOccurrenceClientDTO;
}

function template(completionRate: number): TaskPlanClientDTO {
  return {
    id: 'template-a',
    name: 'Daily plan',
    completionRate,
  } as TaskPlanClientDTO;
}

function entity<T>(dto: T) {
  return { toDTO: vi.fn(() => dto) };
}

function mountComposable() {
  const completed = instance('Completed');
  const pending = instance('Pending');
  const missed = instance('Missed');
  const service = {
    completeInstance: vi.fn().mockResolvedValue(ok(entity(completed))),
    uncompleteInstance: vi.fn().mockResolvedValue(ok(entity(pending))),
    markInstanceMissed: vi.fn().mockResolvedValue(ok(entity(missed))),
    getTemplate: vi
      .fn()
      .mockResolvedValueOnce(ok(entity(template(100))))
      .mockResolvedValueOnce(ok(entity(template(0))))
      .mockResolvedValueOnce(ok(entity(template(25)))),
  };
  const runtime = createTestServerStateRuntime();
  const pinia = createTestPinia();
  let composable!: ReturnType<typeof useTaskOccurrences>;

  mount(
    defineComponent({
      setup() {
        composable = useTaskOccurrences();
        return () => h('div');
      },
    }),
    {
      global: {
        plugins: [[VueQueryPlugin, { queryClient: runtime.queryClient }], pinia, i18n],
        provide: {
          [TASK_SERVICE_KEY as symbol]: service,
          [SERVER_STATE_RUNTIME_KEY]: runtime,
          [SERVER_STATE_IDENTITY_SCOPE_KEY]: () => 'identity-1',
        },
      },
    },
  );

  useTaskStore().setInstances([instance('Pending')]);
  // 模板投影属于 Query Cache authority：预置 detail key。
  runtime.queryClient.setQueryData(
    taskPlanQueryKeys.detail('identity-1', 'template-a'),
    template(0),
  );
  return { composable, service, runtime };
}

describe('useTaskOccurrences template projection refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refreshes the canonical template projection in the query cache after complete and uncomplete', async () => {
    const { composable, service, runtime } = mountComposable();

    await composable.completeInstance('instance-a');
    expect(service.getTemplate).toHaveBeenNthCalledWith(1, 'template-a');
    expect(
      runtime.queryClient.getQueryData<TaskPlanClientDTO>(
        taskPlanQueryKeys.detail('identity-1', 'template-a'),
      )?.completionRate,
    ).toBe(100);

    await composable.uncompleteInstance('instance-a');
    expect(service.getTemplate).toHaveBeenNthCalledWith(2, 'template-a');
    expect(
      runtime.queryClient.getQueryData<TaskPlanClientDTO>(
        taskPlanQueryKeys.detail('identity-1', 'template-a'),
      )?.completionRate,
    ).toBe(0);

    await composable.markInstanceMissed('instance-a');
    expect(service.markInstanceMissed).toHaveBeenCalledWith('instance-a');
    expect(service.getTemplate).toHaveBeenNthCalledWith(3, 'template-a');
    expect(useTaskStore().instances[0]?.status).toBe('Missed');
    expect(
      runtime.queryClient.getQueryData<TaskPlanClientDTO>(
        taskPlanQueryKeys.detail('identity-1', 'template-a'),
      )?.completionRate,
    ).toBe(25);
  });
});
