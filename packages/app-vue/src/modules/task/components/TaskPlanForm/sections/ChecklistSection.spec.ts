/** @vitest-environment happy-dom */
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it, vi } from 'vitest';
import type { TaskPlanViewModel } from '../../types';
import ChecklistSection from './ChecklistSection.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      task: {
        checklist: {
          title: 'Checklist',
          placeholder: 'Add a checklist item',
          add: 'Add',
          empty: 'No checklist items yet',
          remove: 'Remove checklist item',
        },
      },
    },
  },
});

function plan(checklist: TaskPlanViewModel['checklist'] = []): TaskPlanViewModel {
  return {
    id: 'plan-1',
    title: 'Prepare release',
    status: 'Active',
    schedule: { kind: 'OneTime', date: '2026-09-13', timing: { kind: 'AllDay' } },
    importance: 'Moderate',
    reminderConfig: null,
    goalBinding: null,
    checklist,
  };
}

describe('ChecklistSection', () => {
  it('adds a stable checklist definition and emits canonical ordering', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'check-stable' });
    const wrapper = mount(ChecklistSection, {
      props: { modelValue: plan() },
      global: { plugins: [i18n] },
    });

    await wrapper.get('[data-testid="task-checklist-new-item"]').setValue('Prepare evidence');
    await wrapper.get('[data-testid="task-checklist-add"]').trigger('click');

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted?.at(-1)?.[0]).toMatchObject({
      checklist: [{ id: 'check-stable', title: 'Prepare evidence', order: 0 }],
    });
    vi.unstubAllGlobals();
  });

  it('edits and removes definitions without creating occurrence state', async () => {
    const wrapper = mount(ChecklistSection, {
      props: {
        modelValue: plan([
          { id: 'check-a', title: 'First', order: 0 },
          { id: 'check-b', title: 'Second', order: 1 },
        ]),
      },
      global: { plugins: [i18n] },
    });

    await wrapper.get('[data-testid="task-checklist-title-0"]').setValue('Updated first');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      checklist: [
        { id: 'check-a', title: 'Updated first', order: 0 },
        { id: 'check-b', title: 'Second', order: 1 },
      ],
    });

    const removeButtons = wrapper.findAll('button[aria-label="Remove checklist item"]');
    await removeButtons[0]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      checklist: [{ id: 'check-b', title: 'Second', order: 0 }],
    });
  });
});
