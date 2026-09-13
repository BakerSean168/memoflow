import { computed, defineComponent, h, ref, type Component } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskPlanForm from './TaskPlanForm.vue';
import type { TaskPlanViewModel } from '../types';

const isFormValid = ref(true);
const validateForm = vi.fn().mockResolvedValue(true);
const updateBasicValidation = vi.fn();
const updateTimeValidation = vi.fn();
const updateRecurrenceValidation = vi.fn();
const updateReminderValidation = vi.fn();
const updateGoalBindingValidation = vi.fn();
const updateMetadataValidation = vi.fn();

vi.mock('../../composables/useTaskPlanForm', () => ({
  useTaskPlanForm: () => ({
    isFormValid: computed(() => isFormValid.value),
    validateForm,
    updateBasicValidation,
    updateTimeValidation,
    updateRecurrenceValidation,
    updateReminderValidation,
    updateGoalBindingValidation,
    updateMetadataValidation,
  }),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      task: {
        templateForm: {
          loadError: 'Template not available',
          notFoundMessage: 'The selected template no longer exists.',
          close: 'Close',
          advancedSettings: 'Advanced settings',
          advancedSettingsDescription: 'Reminders, organization, and dependencies',
        },
        timeConfig: { title: 'Schedule', allDay: 'All day' },
        recurrence: { title: 'Repeat' },
        krLinks: { title: 'Goal', linkedCount: 'Goal linked' },
        reminderSection: { title: 'Reminder' },
        metadata: { title: 'Properties' },
        templateCard: { noRecurrence: 'No recurrence' },
        checklist: { title: 'Checklist' },
      },
    },
  },
});

function createSectionStub(
  name: string,
  emitValue?: (modelValue: TaskPlanViewModel) => TaskPlanViewModel,
): Component {
  return defineComponent({
    name: `${name}Stub`,
    props: ['modelValue'],
    emits: ['update:model-value', 'update:validation'],
    setup(props, { emit }) {
      return () =>
        h(
          'button',
          {
            type: 'button',
            'data-stub': name,
            onClick: () => {
              emit('update:validation', { isValid: true });
              if (emitValue) {
                emit('update:model-value', emitValue(props.modelValue as TaskPlanViewModel));
              }
            },
          },
          name,
        );
    },
  });
}

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  props: ['disabled', 'variant', 'size'],
  setup(props, { attrs, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          disabled: props.disabled,
        },
        slots.default?.(),
      );
  },
});

function createTemplate(overrides: Partial<TaskPlanViewModel> = {}): TaskPlanViewModel {
  return {
    id: 'template-1',
    title: 'Morning planning',
    status: 'Active',
    schedule: { kind: 'OneTime', date: '2026-09-13', timing: { kind: 'AllDay' } },
    importance: 'Moderate',
    reminderConfig: null,
    goalBinding: null,
    checklist: [],
    ...overrides,
  };
}

function mountForm(modelValue: TaskPlanViewModel | null = createTemplate()) {
  return mount(TaskPlanForm, {
    props: {
      modelValue,
      isEditMode: true,
      goals: [{ id: 'goal-1', title: 'Ship tests' }],
      keyResultsByGoal: {},
    },
    global: {
      plugins: [i18n],
      stubs: {
        Button: ButtonStub,
        AlertCircle: true,
        ListChecks: true,
        BasicInfoSection: createSectionStub('BasicInfoSection', (value) => ({
          ...value,
          title: 'Updated title',
        })),
        TimeConfigSection: createSectionStub('TimeConfigSection'),
        RecurrenceSection: createSectionStub('RecurrenceSection'),
        ReminderSection: createSectionStub('ReminderSection'),
        MetadataSection: createSectionStub('MetadataSection'),
        KeyResultLinksSection: createSectionStub('KeyResultLinksSection'),
        ChecklistSection: createSectionStub('ChecklistSection'),
      },
    },
  });
}

describe('TaskPlanForm', () => {
  beforeEach(() => {
    isFormValid.value = true;
    validateForm.mockClear();
    updateBasicValidation.mockClear();
    updateTimeValidation.mockClear();
    updateRecurrenceValidation.mockClear();
    updateReminderValidation.mockClear();
    updateGoalBindingValidation.mockClear();
    updateMetadataValidation.mockClear();
  });

  it('shows a recoverable load error state when no template is available', async () => {
    const wrapper = mountForm(null);

    expect(wrapper.text()).toContain('Template not available');
    expect(wrapper.text()).toContain('The selected template no longer exists.');

    await wrapper.get('button').trigger('click');

    expect(wrapper.emitted('close')).toEqual([[]]);
  });

  it('re-emits section updates and the current validation state', async () => {
    const wrapper = mountForm();

    expect(wrapper.emitted('update:validation')).toEqual([[{ isValid: true }]]);

    await wrapper.get('[data-stub="BasicInfoSection"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')?.slice(-1)[0]?.[0]).toMatchObject({
      id: 'template-1',
      title: 'Updated title',
    });
  });

  it('includes key-result binding validity in the whole form state', async () => {
    const wrapper = mountForm();

    await wrapper.get('[data-testid="task-goal-chip"]').trigger('click');
    await wrapper.get('[data-stub="KeyResultLinksSection"]').trigger('click');

    expect(updateGoalBindingValidation).toHaveBeenCalledWith({ isValid: true });
  });

  it('uses property chips as the primary entry point for plan settings', async () => {
    const wrapper = mountForm();

    expect(wrapper.get('[data-testid="task-plan-property-chips"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="task-plan-property-editor"]').exists()).toBe(false);
    expect(wrapper.find('[data-stub="TimeConfigSection"]').exists()).toBe(false);
    expect(wrapper.find('[data-stub="RecurrenceSection"]').exists()).toBe(false);

    await wrapper.get('[data-testid="task-schedule-chip"]').trigger('click');
    expect(wrapper.get('[data-stub="TimeConfigSection"]').exists()).toBe(true);

    await wrapper.get('[data-testid="task-reminder-chip"]').trigger('click');
    expect(wrapper.find('[data-stub="TimeConfigSection"]').exists()).toBe(false);
    expect(wrapper.get('[data-stub="ReminderSection"]').exists()).toBe(true);

    await wrapper.get('[data-testid="task-checklist-chip"]').trigger('click');
    expect(wrapper.find('[data-stub="ReminderSection"]').exists()).toBe(false);
    expect(wrapper.get('[data-stub="ChecklistSection"]').exists()).toBe(true);

    await wrapper.get('[data-testid="task-properties-chip"]').trigger('click');
    expect(wrapper.find('[data-stub="ChecklistSection"]').exists()).toBe(false);
    expect(wrapper.get('[data-stub="MetadataSection"]').exists()).toBe(true);
  });

  it('opens the Goal editor without requiring a Key Result', async () => {
    const wrapper = mountForm();
    await wrapper.get('[data-testid="task-goal-chip"]').trigger('click');
    expect(wrapper.get('[data-stub="KeyResultLinksSection"]').exists()).toBe(true);
  });

  it('exposes the composable validate method to parent callers', async () => {
    const wrapper = mountForm();

    await (wrapper.vm as unknown as { validate: () => Promise<boolean> }).validate();

    expect(validateForm).toHaveBeenCalledTimes(1);
  });
});
