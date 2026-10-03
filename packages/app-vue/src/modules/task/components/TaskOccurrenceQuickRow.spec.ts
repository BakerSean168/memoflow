import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { Checkbox, DropdownMenuItem } from '@memoflow/ui-vue-shadcn';
import TaskOccurrenceQuickRow from './TaskOccurrenceQuickRow.vue';
import { instance, template } from './task-quick-test-fixtures';
const i18n = createI18n({ legacy: false, locale: 'en', messages: {} });
function row(status = 'Pending' as ReturnType<typeof instance>['status']) {
  return mount(TaskOccurrenceQuickRow, {
    props: {
      occurrence: instance({
        status,
        version: 7,
        checklistState: [{ definitionId: 'step', titleSnapshot: 'Snapshot', completed: false }],
      }),
      template,
    },
    global: {
      plugins: [i18n],
      stubs: {
        DropdownMenuTrigger: { template: '<div><slot /></div>' },
        DropdownMenuItem: true,
        DropdownMenu: { template: '<div><slot /></div>' },
        DropdownMenuContent: { template: '<div><slot /></div>' },
      },
    },
  });
}
describe('TaskOccurrenceQuickRow', () => {
  it('emits complete, undo, missed, skip, snapshot changes and open-plan', async () => {
    const w = row();
    await w.get('[data-testid="task-compact-complete-occurrence-1"]').trigger('click');
    expect(w.emitted('complete')).toEqual([['occurrence-1']]);
    await w.get('button[aria-label="Morning review"]').trigger('click');
    expect(w.emitted('open-plan')).toEqual([['plan-1']]);
    w.findAllComponents(DropdownMenuItem)[0].vm.$emit('select');
    w.findAllComponents(DropdownMenuItem)[1].vm.$emit('select');
    expect(w.emitted('missed')).toEqual([['occurrence-1']]);
    expect(w.emitted('skip')).toEqual([['occurrence-1']]);
    await w.get('[data-testid="task-compact-checklist-toggle-occurrence-1"]').trigger('click');
    w.getComponent(Checkbox).vm.$emit('update:modelValue', true);
    expect(w.emitted('checklist-change')).toEqual([['occurrence-1', 'step', true, 7]]);
    await w.setProps({ occurrence: instance({ status: 'Completed' }) });
    expect(w.get('article').attributes('data-task-status')).toBe('Completed');
    await w.get('[data-testid="task-compact-complete-occurrence-1"]').trigger('click');
    expect(w.emitted('uncomplete')).toEqual([['occurrence-1']]);
  });
  it.each(['Pending', 'InProgress', 'Missed', 'Skipped', 'Completed'] as const)(
    'matches canonical completion and checklist actions for %s',
    async (status) => {
      const w = row(status);
      const article = w.get('article');
      expect(article.attributes('data-testid')).toBe('task-compact-occurrence-occurrence-1');
      expect(article.attributes('data-task-occurrence-id')).toBe('occurrence-1');
      expect(article.attributes('data-task-status')).toBe(status);
      const complete = w.get('[data-testid="task-compact-complete-occurrence-1"]');
      expect(complete.attributes('disabled')).toBeUndefined();
      await complete.trigger('click');
      const event = status === 'Completed' ? 'uncomplete' : 'complete';
      expect(w.emitted(event)).toEqual([['occurrence-1']]);
      expect(w.emitted(event === 'complete' ? 'uncomplete' : 'complete')).toBeUndefined();
      await w.get('[data-testid="task-compact-checklist-toggle-occurrence-1"]').trigger('click');
      const checkbox = w.getComponent(Checkbox);
      expect(checkbox.props('disabled')).toBe(false);
      checkbox.vm.$emit('update:modelValue', true);
      checkbox.vm.$emit('update:modelValue', false);
      expect(w.emitted('checklist-change')).toEqual([
        ['occurrence-1', 'step', true, 7],
        ['occurrence-1', 'step', false, 7],
      ]);
      const outcomes = w.findAllComponents(DropdownMenuItem);
      if (status === 'Pending' || status === 'InProgress') {
        expect(outcomes).toHaveLength(2);
        outcomes[0].vm.$emit('select');
        outcomes[1].vm.$emit('select');
        expect(w.emitted('missed')).toEqual([['occurrence-1']]);
        expect(w.emitted('skip')).toEqual([['occurrence-1']]);
      } else {
        expect(outcomes).toHaveLength(0);
      }
    },
  );
  it.each(['busy', 'disabled'] as const)('guards every mutation while %s', async (prop) => {
    const w = row();
    await w.setProps({ [prop]: true });
    await w.get('[data-testid="task-compact-complete-occurrence-1"]').trigger('click');
    w.findAllComponents(DropdownMenuItem)[0].vm.$emit('select');
    w.findAllComponents(DropdownMenuItem)[1].vm.$emit('select');
    await w.get('[data-testid="task-compact-checklist-toggle-occurrence-1"]').trigger('click');
    expect(w.getComponent(Checkbox).props('disabled')).toBe(true);
    w.getComponent(Checkbox).vm.$emit('update:modelValue', true);
    expect(w.emitted('complete')).toBeUndefined();
    expect(w.emitted('missed')).toBeUndefined();
    expect(w.emitted('skip')).toBeUndefined();
    expect(w.emitted('checklist-change')).toBeUndefined();
    await w.setProps({ occurrence: instance({ status: 'Completed' }) });
    await w.get('[data-testid="task-compact-complete-occurrence-1"]').trigger('click');
    expect(w.emitted('uncomplete')).toBeUndefined();
  });
});
