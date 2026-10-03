import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { ok } from '@memoflow/contracts/result';
import { TASK_SERVICE_KEY } from '../../../di/keys';
import {
  createTestServerStateRuntime,
  SERVER_STATE_RUNTIME_KEY,
  SERVER_STATE_IDENTITY_SCOPE_KEY,
} from '../../../platform/server-state';
import {
  taskOccurrenceQueryKeys,
  taskPlanQueryKeys,
} from '../../../platform/server-state/query-keys';
import { productionLocaleMessages } from '../../../locales/production-messages';
import { instance, template } from './task-quick-test-fixtures';
import TaskOccurrenceQuickSurface from './TaskOccurrenceQuickSurface.vue';
import TaskOccurrenceCompactList from './TaskOccurrenceCompactList.vue';
import TaskCompletionMeasurementDialog from './dialogs/TaskCompletionMeasurementDialog.vue';
import { useTaskStore } from '../stores/task-store';

enableAutoUnmount(afterEach);
function host(prompt = false, missing?: 'occurrence' | 'plan') {
  const runtime = createTestServerStateRuntime();
  const pinia = createPinia();
  const plan = prompt
    ? {
        ...template,
        goalBinding: {
          goalId: 'goal',
          keyResultId: 'kr',
          contribution: null,
          progressRule: { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue: 2 },
        },
      }
    : template;
  const service = {
    getOccurrence: vi.fn(async () => ok({ toDTO: () => instance() })),
    getPlan: vi.fn(async () => ok({ toDTO: () => plan })),
    completeOccurrence: vi.fn(async () =>
      ok({ toDTO: () => instance({ status: 'Completed', version: 2 }) }),
    ),
    uncompleteOccurrence: vi.fn(async () => ok({ toDTO: () => instance({ version: 3 }) })),
    markOccurrenceMissed: vi.fn(async () =>
      ok({ toDTO: () => instance({ status: 'Missed', version: 4 }) }),
    ),
    skipOccurrence: vi.fn(async () =>
      ok({ toDTO: () => instance({ status: 'Skipped', version: 5 }) }),
    ),
    setOccurrenceChecklistItem: vi.fn(async () =>
      ok({
        toDTO: () =>
          instance({
            version: 6,
            checklistState: [
              { definitionId: 'step', titleSnapshot: 'Review', completed: true, completedAt: 0 },
            ],
          }),
      }),
    ),
  };
  if (missing === 'occurrence')
    service.getOccurrence.mockRejectedValue(new Error('Occurrence unavailable'));
  if (missing === 'plan') service.getPlan.mockRejectedValue(new Error('Plan unavailable'));
  const wrapper = mount(TaskOccurrenceQuickSurface, {
    props: { occurrenceId: 'occurrence-1' },
    global: {
      plugins: [
        pinia,
        [VueQueryPlugin, { queryClient: runtime.queryClient }],
        createI18n({ legacy: false, locale: 'en-US', messages: productionLocaleMessages }),
      ],
      provide: {
        [TASK_SERVICE_KEY as symbol]: service,
        [SERVER_STATE_RUNTIME_KEY]: runtime,
        [SERVER_STATE_IDENTITY_SCOPE_KEY]: () => 'identity-1',
      },
      stubs: { TaskOccurrenceCompactList: true, TaskCompletionMeasurementDialog: true },
    },
  });
  return { wrapper, service, runtime, pinia };
}
async function ready(wrapper: ReturnType<typeof host>['wrapper']) {
  await vi.waitFor(() =>
    expect(wrapper.getComponent(TaskOccurrenceCompactList).props('rows')).toHaveLength(1),
  );
}
it('reads exactly its owner occurrence and canonical cached plan; emits View Plan', async () => {
  const { wrapper, service, runtime } = host();
  await ready(wrapper);
  expect(service.getOccurrence).toHaveBeenCalledExactlyOnceWith('occurrence-1');
  expect(service.getPlan).toHaveBeenCalledExactlyOnceWith('plan-1');
  expect(
    runtime.queryClient.getQueryData(taskPlanQueryKeys.detail('identity-1', 'plan-1')),
  ).toEqual(template);
  wrapper.getComponent(TaskOccurrenceCompactList).vm.$emit('open-plan', 'plan-1');
  expect(wrapper.emitted('open-plan')).toEqual([['plan-1']]);
});
it.each(['occurrence', 'plan'])(
  'shows a retryable error when the %s is missing and never exposes actions',
  async (owner) => {
    const { wrapper, service } = host(false, owner as 'occurrence' | 'plan');
    await vi.waitFor(() =>
      expect(wrapper.find('[data-testid="task-quick-error"]').exists()).toBe(true),
    );
    expect(wrapper.findComponent(TaskOccurrenceCompactList).exists()).toBe(false);
    if (owner === 'occurrence') expect(service.getPlan).not.toHaveBeenCalled();
    service.getOccurrence.mockResolvedValue(ok({ toDTO: () => instance() }));
    service.getPlan.mockResolvedValue(ok({ toDTO: () => template }));
    await wrapper.get('[data-testid="task-quick-error"] button').trigger('click');
    await ready(wrapper);
  },
);
it('all canonical actions converge detail, ranges, and store without another owner read', async () => {
  const { wrapper, service, runtime, pinia } = host();
  await ready(wrapper);
  const rangeKey = taskOccurrenceQueryKeys.range('identity-1', 1, 2);
  runtime.queryClient.setQueryData(rangeKey, [instance()]);
  useTaskStore(pinia).setInstances([instance()]);
  for (const [event, command, version] of [
    ['complete', service.completeOccurrence, 2],
    ['uncomplete', service.uncompleteOccurrence, 3],
    ['missed', service.markOccurrenceMissed, 4],
    ['skip', service.skipOccurrence, 5],
  ] as const) {
    wrapper.getComponent(TaskOccurrenceCompactList).vm.$emit(event, 'occurrence-1');
    await flushPromises();
    await vi.waitFor(() =>
      expect(
        wrapper.getComponent(TaskOccurrenceCompactList).props('rows')[0].occurrence.version,
      ).toBe(version),
    );
    expect(command.mock.calls[0]?.[0]).toBe('occurrence-1');
    expect(runtime.queryClient.getQueryData(rangeKey)).toEqual([
      instance({
        status:
          event === 'complete'
            ? 'Completed'
            : event === 'missed'
              ? 'Missed'
              : event === 'skip'
                ? 'Skipped'
                : 'Pending',
        version,
      }),
    ]);
  }
  wrapper
    .getComponent(TaskOccurrenceCompactList)
    .vm.$emit('checklist-change', 'occurrence-1', 'step', true, 5);
  await flushPromises();
  expect(service.setOccurrenceChecklistItem).toHaveBeenCalledWith('occurrence-1', {
    definitionId: 'step',
    completed: true,
    expectedVersion: 5,
  });
  const dto = wrapper.getComponent(TaskOccurrenceCompactList).props('rows')[0].occurrence;
  expect(dto.version).toBe(6);
  expect(
    runtime.queryClient.getQueryData(taskOccurrenceQueryKeys.detail('identity-1', 'occurrence-1')),
  ).toEqual(dto);
  expect(useTaskStore(pinia).instances).toContainEqual(dto);
  expect(service.getOccurrence).toHaveBeenCalledTimes(1);
});
it('resolves Prompt from the owner plan and completes via the canonical measurement session', async () => {
  const { wrapper, service } = host(true);
  await ready(wrapper);
  wrapper.getComponent(TaskOccurrenceCompactList).vm.$emit('complete', 'occurrence-1');
  await flushPromises();
  const coordinator = wrapper.getComponent(TaskCompletionMeasurementDialog).props('coordinator');
  expect(coordinator.pendingMeasurement.value).toEqual({
    occurrenceId: 'occurrence-1',
    goalId: 'goal',
    keyResultId: 'kr',
    suggestedValue: 2,
  });
  expect(service.completeOccurrence).not.toHaveBeenCalled();
  await coordinator.submitMeasurement(3, 'actual');
  await flushPromises();
  expect(service.completeOccurrence).toHaveBeenCalledWith('occurrence-1', {
    goalMeasurement: { value: 3, note: 'actual' },
  });
  expect(coordinator.pendingMeasurement.value).toBeNull();
  expect(wrapper.getComponent(TaskOccurrenceCompactList).props('rows')[0].occurrence.status).toBe(
    'Completed',
  );
});
