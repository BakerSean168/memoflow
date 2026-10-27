import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref, watch } from 'vue';
import TaskCompletionMeasurementDialog from './TaskCompletionMeasurementDialog.vue';
import { useTaskOccurrenceActionCoordinator } from '../../composables/useTaskOccurrenceActionCoordinator';
import { instance } from '../task-quick-test-fixtures';
import enUS from '@task-ui-test-host/locales/en-US';
import type { TaskGoalBindingDTO } from '@memoflow/task-contracts';
import { installTaskUiHost } from '@task-ui-test-host/di/task-ui-host';
import { taskUiHost } from '../../task-ui-host';
installTaskUiHost();

// 裁决二 boundary: the Goal composer reaches this dialog only as a host slot, so
// the Task-side contract is exercised against a slot double that reproduces the
// published props, events and exposed submit(). Goal-owned rendering (preview
// text, calculation vocabulary) stays covered by the goal-ui specs for
// GoalRecordComposerSurface.
const composerState = vi.hoisted(() => ({ available: true }));
const GoalComposerDouble = defineComponent({
  name: 'GoalRecordComposerSurface',
  props: {
    goalId: { type: String, required: true },
    keyResultId: { type: String, required: true },
    initialValue: { type: Number, default: null },
    initialNote: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
  },
  emits: ['submit', 'cancel', 'validity-change', 'dirty-change'],
  setup(props, { emit, expose }) {
    const draft = ref<{ value: number | string; note: string }>({
      value: props.initialValue ?? '',
      note: props.initialNote,
    });
    const isValid = computed(
      () =>
        composerState.available &&
        typeof draft.value.value === 'number' &&
        Number.isFinite(draft.value.value),
    );
    watch(isValid, (valid) => emit('validity-change', valid), { immediate: true });
    const isDirty = computed(
      () =>
        draft.value.value !== (props.initialValue ?? '') || draft.value.note !== props.initialNote,
    );
    watch(isDirty, (dirty) => emit('dirty-change', dirty), { immediate: true });
    function submit() {
      if (props.disabled || !isValid.value || typeof draft.value.value !== 'number') return;
      emit('submit', { value: draft.value.value, note: draft.value.note });
    }
    function onKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!props.disabled) emit('cancel');
        return;
      }
      if (event.key !== 'Enter') return;
      if ((event.target as HTMLElement).tagName === 'TEXTAREA') return;
      event.preventDefault();
      submit();
    }
    expose({ submit });
    return () =>
      h('form', { id: 'goal-record-form' }, [
        composerState.available
          ? null
          : h('p', { 'data-testid': 'goal-record-preview' }, 'Preview unavailable'),
        h('input', {
          id: 'change-amount',
          type: 'number',
          value: String(draft.value.value),
          disabled: props.disabled,
          onInput: (event: Event) => {
            const target = event.target as HTMLInputElement;
            draft.value.value = target.value === '' ? '' : Number(target.value);
          },
          onKeydown,
        }),
        h('textarea', {
          id: 'record-note',
          value: draft.value.note,
          disabled: props.disabled,
          onInput: (event: Event) => {
            draft.value.note = (event.target as HTMLTextAreaElement).value;
          },
          onKeydown,
        }),
      ]);
  },
});
taskUiHost.components.GoalRecordComposerSurface = GoalComposerDouble;

beforeEach(() => {
  composerState.available = true;
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
  composerState.available = false;
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
  expect(
    w.get<HTMLButtonElement>('[data-testid="task-record-and-complete"]').element.disabled,
  ).toBe(false);
  expect(o.completeOccurrence).not.toHaveBeenCalled();
  w.unmount();
});
