import { ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, expect, it, vi } from 'vitest';
import TaskQuickSurface from './TaskQuickSurface.vue';
import TaskCompletionMeasurementDialog from './dialogs/TaskCompletionMeasurementDialog.vue';
import TaskOccurrenceCompactList from './TaskOccurrenceCompactList.vue';
import { instance, template } from './task-quick-test-fixtures';
import { buildQuickTaskRequest } from '../utils/quick-task-request';
const { createPlanSafe } = vi.hoisted(() => ({ createPlanSafe: vi.fn() }));
vi.mock('../composables/useTaskPlanMutations', () => ({
  useTaskPlanMutations: () => ({ createPlanSafe, isSaving: ref(false) }),
}));
const operations = {
  completeOccurrence: vi.fn(),
  uncompleteOccurrence: vi.fn(),
  markOccurrenceMissed: vi.fn(),
  skipOccurrence: vi.fn(),
  setOccurrenceChecklistItem: vi.fn(),
};
function surface(props = {}) {
  return mount(TaskQuickSurface, {
    props: {
      title: 'Tasks',
      subtitle: 'Today',
      occurrences: [instance()],
      templates: [template],
      operations,
      ...props,
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: {} })],
      stubs: { TaskOccurrenceCompactList: true, TaskCompletionMeasurementDialog: true },
    },
  });
}
beforeEach(() => vi.resetAllMocks());
it('renders summary, progress and sorted rows, with optional summary/footer', async () => {
  const w = surface();
  expect(w.text()).toContain('Tasks');
  expect(w.text()).toContain('Today');
  expect(w.get('[data-testid="task-quick-count"]').text()).toBe('0/1');
  expect(w.get('[data-testid="task-quick-progress"]').attributes('data-progress')).toBe('0');
  await w.setProps({
    occurrences: [
      instance({ status: 'Completed' }),
      instance({ id: 'second' as ReturnType<typeof instance>['id'] }),
    ],
  });
  expect(w.get('[data-testid="task-quick-progress"]').attributes('style')).toContain('50%');
  expect(w.get('[data-testid="task-quick-progress"]').attributes('data-progress')).toBe('50');
  expect(w.getComponent(TaskOccurrenceCompactList).props('rows')[0].occurrence.id).toBe('second');
  await w.get('[data-testid="task-quick-view-all"]').trigger('click');
  expect(w.emitted('view-all')).toEqual([[]]);
  await w.setProps({ summary: false, viewAll: false });
  expect(w.find('[data-testid="task-quick-count"]').exists()).toBe(false);
  expect(w.find('[data-testid="task-quick-progress"]').exists()).toBe(false);
  expect(w.find('[data-testid="task-quick-view-all"]').exists()).toBe(false);
  expect(w.find('input').exists()).toBe(false);
});
it.each([
  [1, '33'],
  [2, '67'],
  [3, '100'],
] as const)('exposes integer progress for %i of 3 completed occurrences', (completed, progress) => {
  const w = surface({
    occurrences: Array.from({ length: 3 }, (_, index) =>
      instance({
        id: `occurrence-${index}` as ReturnType<typeof instance>['id'],
        status: index < completed ? 'Completed' : 'Pending',
      }),
    ),
  });
  expect(w.get('[data-testid="task-quick-count"]').text()).toBe(`${completed}/3`);
  expect(w.get('[data-testid="task-quick-progress"]').attributes('data-progress')).toBe(progress);
});
it('handles loading, error/retry, empty and stale rows', async () => {
  const w = surface({ occurrences: [], loading: true });
  expect(w.find('[data-testid="task-quick-loading"]').exists()).toBe(true);
  await w.setProps({ loading: false, error: 'Failed' });
  await w.get('[data-testid="task-quick-error"] button').trigger('click');
  expect(w.emitted('retry')).toEqual([[]]);
  await w.setProps({ error: null });
  expect(w.find('[data-testid="task-quick-empty"]').exists()).toBe(true);
  await w.setProps({ loading: true, occurrences: [instance()] });
  expect(w.findComponent(TaskOccurrenceCompactList).exists()).toBe(true);
});
it('uses canonical quick capture, retains failed drafts and announces success', async () => {
  const w = surface({ quickCreate: true });
  await w.get('[data-testid="task-quick-quick-task"]').trigger('click');
  await w.get('input').setValue('  Review  ');
  createPlanSafe.mockResolvedValueOnce(null);
  await w.get('form').trigger('submit');
  await flushPromises();
  expect(createPlanSafe).toHaveBeenCalledWith(buildQuickTaskRequest('Review'), 'quick');
  expect(w.get('input').element.value).toBe('  Review  ');
  expect(w.emitted('created')).toBeUndefined();
  createPlanSafe.mockResolvedValueOnce({});
  await w.get('form').trigger('submit');
  await flushPromises();
  expect(w.emitted('created')).toEqual([[]]);
  expect(w.find('form').exists()).toBe(false);
});
it('routes list actions through the coordinator and emits completed only on success', async () => {
  const w = surface();
  const list = w.getComponent(TaskOccurrenceCompactList);
  operations.completeOccurrence.mockResolvedValueOnce(null);
  list.vm.$emit('complete', 'one');
  await flushPromises();
  expect(w.emitted('completed')).toBeUndefined();
  const result = instance({ status: 'Completed' });
  operations.completeOccurrence.mockResolvedValueOnce(result);
  list.vm.$emit('complete', 'one');
  await flushPromises();
  expect(w.emitted('completed')).toEqual([[result]]);
  for (const [event, command] of [
    ['uncomplete', operations.uncompleteOccurrence],
    ['missed', operations.markOccurrenceMissed],
    ['skip', operations.skipOccurrence],
  ] as const) {
    list.vm.$emit(event, 'one');
    await flushPromises();
    expect(command).toHaveBeenCalledWith('one');
  }
  list.vm.$emit('checklist-change', 'one', 'step', true, 7);
  await flushPromises();
  expect(operations.setOccurrenceChecklistItem).toHaveBeenCalledWith('one', {
    definitionId: 'step',
    completed: true,
    expectedVersion: 7,
  });
  list.vm.$emit('open-plan', 'plan');
  expect(w.emitted('open-plan')).toEqual([['plan']]);
});

it('passes the active occurrence identity while guarding concurrent surface actions', async () => {
  let resolve!: (value: ReturnType<typeof instance>) => void;
  operations.completeOccurrence.mockReturnValueOnce(
    new Promise<ReturnType<typeof instance>>((done) => { resolve = done; }),
  );
  const w = surface({
    occurrences: [instance(), instance({ id: 'second' as ReturnType<typeof instance>['id'] })],
  });
  const list = w.getComponent(TaskOccurrenceCompactList);
  expect(list.props('busyOccurrenceId')).toBeNull();
  list.vm.$emit('complete', 'occurrence-1');
  await flushPromises();
  expect(list.props('busyOccurrenceId')).toBe('occurrence-1');
  list.vm.$emit('skip', 'second');
  await flushPromises();
  expect(operations.skipOccurrence).not.toHaveBeenCalled();
  resolve(instance({ status: 'Completed' }));
  await flushPromises();
  expect(list.props('busyOccurrenceId')).toBeNull();
});

it('Quick Surface resolves Prompt from its current Plan and routes measured/complete-only success', async () => {
  const plan = { ...template, goalBinding: { goalId: 'goal' as never, keyResultId: 'kr' as never, contribution: null,
    progressRule: { mode: 'Prompt' as const, trigger: 'EachCompletion' as const, suggestedValue: -2 } } };
  const w = surface({ templates: [plan] });
  const list = w.getComponent(TaskOccurrenceCompactList);
  list.vm.$emit('complete', 'occurrence-1');
  await flushPromises();
  const dialog = w.getComponent(TaskCompletionMeasurementDialog);
  const coordinator = dialog.props('coordinator');
  expect(coordinator.pendingMeasurement.value).toEqual({ occurrenceId: 'occurrence-1', goalId: 'goal', keyResultId: 'kr', suggestedValue: -2 });
  expect(operations.completeOccurrence).not.toHaveBeenCalled();
  const result = instance({ status: 'Completed' });
  operations.completeOccurrence.mockResolvedValue(result);
  await coordinator.submitMeasurement(0, 'actual');
  dialog.vm.$emit('completed', result);
  expect(operations.completeOccurrence).toHaveBeenLastCalledWith('occurrence-1', { goalMeasurement: { value: 0, note: 'actual' } });
  expect(w.emitted('completed')).toEqual([[result]]);
  list.vm.$emit('uncomplete', 'occurrence-1');
  await flushPromises();
  list.vm.$emit('complete', 'occurrence-1');
  await flushPromises();
  expect(coordinator.pendingMeasurement.value).not.toBeNull();
  await coordinator.completeWithoutMeasurement();
  expect(operations.completeOccurrence).toHaveBeenLastCalledWith('occurrence-1');
  w.unmount();
});
