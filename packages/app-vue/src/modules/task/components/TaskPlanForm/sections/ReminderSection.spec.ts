/** @vitest-environment happy-dom */
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import { ReminderTimeUnit, TaskReminderType } from '@memoflow/contracts/task';
import type { TaskPlanViewModel } from '../../types';
import ReminderSection from './ReminderSection.vue';

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
