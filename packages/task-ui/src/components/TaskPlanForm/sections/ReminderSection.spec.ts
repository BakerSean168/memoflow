/** @vitest-environment happy-dom */
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { ReminderTimeUnit, TaskReminderType } from '@memoflow/task-contracts';
import type { TaskPlanViewModel } from '../../types';
import ReminderSection from './ReminderSection.vue';
import { installTaskUiHost } from '@task-ui-test-host/di/task-ui-host';
installTaskUiHost();


const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      common: { delete: 'Delete' },
      task: {
        reminderSection: {
          title: 'Reminder',
          enable: 'Enable',
          triggers: 'Triggers',
          type: 'Type',
          selectType: 'Select type',
          relative: 'Relative',
          absolute: 'Absolute',
          advanceTime: 'Advance time',
          timeUnit: 'Time unit',
          selectUnit: 'Select unit',
          reminderTime: 'Reminder time',
          addTrigger: 'Add trigger',
          minutes: 'Minutes',
          hours: 'Hours',
          days: 'Days',
          atLeastOneTrigger: 'At least one trigger',
          triggerAdvanceTimePositive: 'Trigger {index} needs a positive value',
          triggerSelectUnit: 'Trigger {index} needs a unit',
          triggerSelectTime: 'Trigger {index} needs a time',
        },
      },
    },
  },
});

function plan(): TaskPlanViewModel {
  return {
    id: 'plan-1',
    title: 'Release review',
    status: 'Active',
    schedule: { kind: 'OneTime', date: '2026-09-13', timing: { kind: 'At', time: '09:00' } },
    importance: 'Moderate',
    goalBinding: null,
    checklist: [],
    reminderConfig: {
      enabled: true,
      triggers: [
        {
          type: TaskReminderType.Relative,
          absoluteTime: null,
          relativeValue: 15,
          relativeUnit: ReminderTimeUnit.Minutes,
        },
        {
          type: TaskReminderType.Relative,
          absoluteTime: null,
          relativeValue: 1,
          relativeUnit: ReminderTimeUnit.Hours,
        },
      ],
    },
  };
}

describe('ReminderSection multi-trigger parity', () => {
  it('keeps validation in one reserved line and clears it after correcting a trigger', async () => {
    const invalid = plan();
    invalid.reminderConfig!.triggers[0]!.relativeValue = -1;
    const wrapper = mount(ReminderSection, {
      props: { modelValue: invalid },
      global: { plugins: [i18n] },
    });
    await nextTick();
    const slot = wrapper.get('[aria-live="polite"]');
    const slotElement = slot.element;
    expect(slot.classes()).toContain('min-h-4');
    const error = wrapper.get('[role="alert"]');
    expect(error.classes()).toContain('truncate');
    expect(error.attributes('title')).toContain('positive value');
    expect(wrapper.attributes('aria-describedby')).toBe(error.attributes('id'));
    await wrapper
      .get('[data-testid="task-reminder-trigger-0"] input[type="number"]')
      .setValue('15');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('[aria-live="polite"]').element).toBe(slotElement);
    expect(wrapper.emitted('update:validation')?.at(-1)).toEqual([true]);
    wrapper.unmount();
  });

  it('preserves multiple triggers and can append another trigger without collapsing the existing set', async () => {
    const wrapper = mount(ReminderSection, {
      props: { modelValue: plan() },
      global: { plugins: [i18n] },
    });

    expect(wrapper.findAll('[data-testid^="task-reminder-trigger-"]')).toHaveLength(2);

    await wrapper.get('[data-testid="task-reminder-add-trigger"]').trigger('click');

    const emitted = wrapper.emitted('update:modelValue');
    const latest = emitted?.at(-1)?.[0] as TaskPlanViewModel;
    expect(latest.reminderConfig).toMatchObject({
      enabled: true,
      triggers: [
        {
          type: TaskReminderType.Relative,
          relativeValue: 15,
          relativeUnit: ReminderTimeUnit.Minutes,
        },
        { type: TaskReminderType.Relative, relativeValue: 1, relativeUnit: ReminderTimeUnit.Hours },
        {
          type: TaskReminderType.Relative,
          relativeValue: 15,
          relativeUnit: ReminderTimeUnit.Minutes,
        },
      ],
    });
  });
});
