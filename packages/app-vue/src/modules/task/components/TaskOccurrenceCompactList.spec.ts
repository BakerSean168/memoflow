import { createI18n } from 'vue-i18n';
import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import TaskOccurrenceCompactList from './TaskOccurrenceCompactList.vue';
import TaskOccurrenceQuickRow from './TaskOccurrenceQuickRow.vue';
import { instance, template } from './task-quick-test-fixtures';
it('renders quick rows and forwards semantic events without fetching', () => {
  const w = mount(TaskOccurrenceCompactList, {
    props: { rows: [{ occurrence: instance(), template }], busyOccurrenceId: 'occurrence-1' },
    global: { stubs: { TaskOccurrenceQuickRow: true } },
  });
  const row = w.getComponent(TaskOccurrenceQuickRow);
  expect(row.props('busy')).toBe(true);
  for (const event of ['complete', 'uncomplete', 'missed', 'skip', 'open-plan']) {
    row.vm.$emit(event, 'one');
    expect(w.emitted(event)).toEqual([['one']]);
  }
  row.vm.$emit('checklist-change', 'one', 'step', true, 7);
  expect(w.emitted('checklist-change')).toEqual([['one', 'step', true, 7]]);
});
it('shows a spinner only for the active occurrence and disables both rows until idle', async () => {
  const w = mount(TaskOccurrenceCompactList, {
    props: {
      rows: [
        { occurrence: instance(), template },
        { occurrence: instance({ id: 'second' as ReturnType<typeof instance>['id'] }), template },
      ],
      busyOccurrenceId: 'occurrence-1',
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: {} })],
    },
  });
  const active = w.get('[data-testid="task-compact-complete-occurrence-1"]');
  const other = w.get('[data-testid="task-compact-complete-second"]');
  expect(active.find('.animate-spin').exists()).toBe(true);
  expect(other.find('.animate-spin').exists()).toBe(false);
  expect(active.attributes('disabled')).toBeDefined();
  expect(other.attributes('disabled')).toBeDefined();
  await other.trigger('click');
  expect(w.emitted('complete')).toBeUndefined();
  await w.setProps({ busyOccurrenceId: null });
  expect(w.find('.animate-spin').exists()).toBe(false);
  expect(active.attributes('disabled')).toBeUndefined();
  expect(other.attributes('disabled')).toBeUndefined();
  await other.trigger('click');
  expect(w.emitted('complete')).toEqual([['second']]);
});
