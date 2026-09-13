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

function instance(
  status: TaskOccurrenceClientDTO['status'],
  overrides: Partial<TaskOccurrenceClientDTO> = {},
): TaskOccurrenceClientDTO {
  const now = Date.now();
  const result =
    status === 'Completed'
      ? {
          kind: 'Completed' as const,
          recordedAt: now,
          actualDurationMinutes: null,
          note: null,
          rating: null,
        }
      : status === 'Missed'
        ? { kind: 'Missed' as const, recordedAt: now, reason: null }
        : status === 'Skipped'
          ? { kind: 'Skipped' as const, recordedAt: now, reason: null }
          : null;
  return {
    id: 'instance-a' as TaskOccurrenceClientDTO['id'],
    planId: 'template-a' as TaskOccurrenceClientDTO['planId'],
    identityId: 'identity-1' as TaskOccurrenceClientDTO['identityId'],
    occurrenceKey: 'template-a:2026-09-13',
    scheduleSnapshot: {
      date: '2026-09-13' as TaskOccurrenceClientDTO['scheduleSnapshot']['date'],
      timing: { kind: 'AllDay' },
    },
    importanceSnapshot: 'Moderate',
    status,
    actualStartAt: null,
    result,
    checklistState: [],
    dueAt: now,
    isOverdue: false,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
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
    completeOccurrence: vi.fn().mockResolvedValue(ok(entity(completed))),
    uncompleteOccurrence: vi.fn().mockResolvedValue(ok(entity(pending))),
    markOccurrenceMissed: vi.fn().mockResolvedValue(ok(entity(missed))),
    setOccurrenceChecklistItem: vi.fn().mockResolvedValue(
      ok(
        entity(
          instance('Pending', {
            version: 2,
            checklistState: [
              {
                definitionId: 'check-1',
                titleSnapshot: 'Prepare evidence',
                orderSnapshot: 0,
                completed: true,
                completedAt: Date.now(),
              },
            ],
          }),
        ),
      ),
    ),
    getPlan: vi
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

    await composable.completeOccurrence('instance-a');
    expect(service.getPlan).toHaveBeenNthCalledWith(1, 'template-a');
    expect(
      runtime.queryClient.getQueryData<TaskPlanClientDTO>(
        taskPlanQueryKeys.detail('identity-1', 'template-a'),
      )?.completionRate,
    ).toBe(100);

    await composable.uncompleteOccurrence('instance-a');
    expect(service.getPlan).toHaveBeenNthCalledWith(2, 'template-a');
    expect(
      runtime.queryClient.getQueryData<TaskPlanClientDTO>(
        taskPlanQueryKeys.detail('identity-1', 'template-a'),
      )?.completionRate,
    ).toBe(0);

    await composable.markOccurrenceMissed('instance-a');
    expect(service.markOccurrenceMissed).toHaveBeenCalledWith('instance-a');
    expect(service.getPlan).toHaveBeenNthCalledWith(3, 'template-a');
    expect(useTaskStore().instances[0]?.status).toBe('Missed');
    expect(
      runtime.queryClient.getQueryData<TaskPlanClientDTO>(
        taskPlanQueryKeys.detail('identity-1', 'template-a'),
      )?.completionRate,
    ).toBe(25);
  });

  it('updates one occurrence checklist snapshot through the owner command and refreshes the plan projection', async () => {
    const { composable, service } = mountComposable();

    const updated = await composable.setOccurrenceChecklistItem('instance-a', {
      definitionId: 'check-1',
      completed: true,
      expectedVersion: 1,
    });

    expect(service.setOccurrenceChecklistItem).toHaveBeenCalledWith('instance-a', {
      definitionId: 'check-1',
      completed: true,
      expectedVersion: 1,
    });
    expect(updated?.checklistState[0]).toMatchObject({
      definitionId: 'check-1',
      completed: true,
    });
    expect(useTaskStore().instances[0]?.checklistState[0]?.completed).toBe(true);
    expect(service.getPlan).toHaveBeenCalledWith('template-a');
  });
});
