import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import TaskCompletionMeasurementDialog from './TaskCompletionMeasurementDialog.vue';
import { useTaskOccurrenceActionCoordinator } from '../../composables/useTaskOccurrenceActionCoordinator';
import { instance } from '../task-quick-test-fixtures';
import enUS from '../../../../locales/en-US';
import type { TaskGoalBindingDTO } from '@memoflow/contracts/task';
const owner = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../../goal/composables/useGoal', () => ({
  useGoal: () => ({ getKeyResultById: () => undefined, getGoalRecordPreviewContext: owner.read }),
}));
beforeEach(() => {
  owner.read.mockReset();
  owner.read.mockResolvedValue({
    keyResultId: 'kr',
    aggregationMethod: 'Sum',
    initialValue: 0,
    currentValue: 40,
    trackingBaseValue: 40,
    targetValue: 100,
    unit: 'kg',
    aggregationSnapshot: { count: 0, sum: 0, min: null, max: null, last: null },
  });
});
async function dialog() {
  const result = instance({ status: 'Completed' });
  const operations = {
    completeOccurrence: vi.fn().mockResolvedValue(result),
    uncompleteOccurrence: vi.fn(),
    markOccurrenceMissed: vi.fn(),
    skipOccurrence: vi.fn(),
    setOccurrenceChecklistItem: vi.fn(),
  };
  const coordinator = useTaskOccurrenceActionCoordinator({
    operations,
    resolveGoalBinding: () =>
      ({
        goalId: 'goal',
        keyResultId: 'kr',
        contribution: null,
        progressRule: { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue: 0 },
      }) as TaskGoalBindingDTO,
  });
  const wrapper = mount(TaskCompletionMeasurementDialog, {
    props: { coordinator },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
      stubs: {
        Dialog: defineComponent({
          setup(_, { slots }) {
            return () => h('div', slots.default?.());
          },
        }),
        ProductDialogShell: defineComponent({
          setup(_, { slots }) {
            return () => h('div', [slots.default?.(), slots.footer?.()]);
          },
        }),
      },
    },
  });
  await coordinator.requestComplete('one');
  await flushPromises();
  return { wrapper, coordinator, operations, result };
}
it('retains edited value/note on completion failure and retries the same Task command', async () => {
  const { wrapper: w, coordinator: c, operations: o, result } = await dialog();
  expect(w.get<HTMLInputElement>('#change-amount').element.value).toBe('0');
  await w.get('#change-amount').setValue('-3');
  await w.get('#record-note').setValue('actual');
  o.completeOccurrence.mockResolvedValueOnce(null);
  await w.get('[data-testid="task-record-and-complete"]').trigger('click');
  await flushPromises();
  expect(w.get<HTMLInputElement>('#change-amount').element.value).toBe('-3');
  expect(w.get<HTMLTextAreaElement>('#record-note').element.value).toBe('actual');
  expect(w.get('[role="alert"]').text()).toContain('Completion failed');
  expect(c.pendingMeasurement.value).not.toBeNull();
  await w.get('#change-amount').trigger('keydown', { key: 'Enter' });
  await flushPromises();
  expect(o.completeOccurrence).toHaveBeenLastCalledWith('one', {
    goalMeasurement: { value: -3, note: 'actual' },
  });
  expect(w.emitted('completed')).toEqual([[result]]);
  expect(c.pendingMeasurement.value).toBeNull();
  w.unmount();
});
it('keeps complete-only available when Goal is unavailable and clears cancel/reopen state', async () => {
  owner.read.mockRejectedValue(new Error('offline'));
  const { wrapper: w, coordinator: c, operations: o } = await dialog();
  expect(w.text()).toContain('Preview unavailable');
  expect(
    w.get<HTMLButtonElement>('[data-testid="task-record-and-complete"]').element.disabled,
  ).toBe(true);
  expect(w.get<HTMLButtonElement>('[data-testid="task-complete-only"]').element.disabled).toBe(
    false,
  );
  await w.get('[data-testid="task-complete-only"]').trigger('click');
  await flushPromises();
  expect(o.completeOccurrence).toHaveBeenCalledExactlyOnceWith('one');
  expect(c.pendingMeasurement.value).toBeNull();
  await c.requestComplete('two');
  await flushPromises();
  await w.get('#change-amount').trigger('keydown', { key: 'Escape' });
  expect(c.pendingMeasurement.value).toBeNull();
  expect(o.completeOccurrence).toHaveBeenCalledOnce();
  w.unmount();
});

it('cancelling and immediately reopening the same occurrence resets the composer draft', async () => {
  const { wrapper: w, coordinator: c, operations: o } = await dialog();
  await w.get('#change-amount').setValue('-9');
  await w.get('#record-note').setValue('discard');
  c.cancelMeasurement();
  await c.requestComplete('one');
  await flushPromises();
  expect(w.get<HTMLInputElement>('#change-amount').element.value).toBe('0');
  expect(w.get<HTMLTextAreaElement>('#record-note').element.value).toBe('');
  expect(w.get<HTMLButtonElement>('[data-testid="task-record-and-complete"]').element.disabled).toBe(false);
  expect(o.completeOccurrence).not.toHaveBeenCalled();
  w.unmount();
});
