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

vi.mock('../../../../shared/composables/useLabelCatalog', () => ({
  useLabelCatalog: () => ({
    labels: ref([]),
    options: ref([]),
    isLoading: ref(false),
    createLabel: vi.fn(),
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
        },
        basicInfo: {
          description: 'Description',
          descPlaceholder: 'Add details',
        },
        timeConfig: { title: 'Schedule', allDay: 'All day' },
        recurrence: { title: 'Repeat' },
        krLinks: { title: 'Goal', linkedCount: 'Goal linked' },
        reminderSection: { title: 'Reminder' },
        metadata: {
          title: 'Properties',
          importance: 'Importance',
          selectImportance: 'Set importance',
          importanceCritical: 'Critical',
          importanceHigh: 'High',
          importanceMedium: 'Medium',
          importanceLow: 'Low',
          importanceMinimal: 'Minimal',
          labels: 'Labels',
          labelsPlaceholder: 'Add labels',
          searchLabels: 'Search labels',
          noLabels: 'No labels',
          createLabel: 'Create label',
          labelCreateFailed: 'Failed to create label',
        },
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
              emit('update:validation', true);
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

const PassthroughStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.());
  },
});

const LabelPickerStub = defineComponent({
  name: 'LabelPickerStub',
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => h('button', { ...attrs, type: 'button', 'data-testid': 'label-picker-stub' });
  },
});

function createPlan(overrides: Partial<TaskPlanViewModel> = {}): TaskPlanViewModel {
  return {
    id: 'template-1',
    title: 'Morning planning',
    description: '',
    status: 'Active',
    schedule: { kind: 'OneTime', date: '2026-09-13', timing: { kind: 'AllDay' } },
    importance: 'Moderate',
    labels: [],
    labelIds: [],
    reminderConfig: null,
    goalBinding: null,
    checklist: [],
    ...overrides,
  };
}

function mountForm(modelValue: TaskPlanViewModel | null = createPlan()) {
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
        BasicInfoSection: createSectionStub('BasicInfoSection', (value) => ({
          ...value,
          title: 'Updated title',
        })),
        TimeConfigSection: createSectionStub('TimeConfigSection'),
        RecurrenceSection: createSectionStub('RecurrenceSection'),
        ReminderSection: createSectionStub('ReminderSection'),
        KeyResultLinksSection: createSectionStub('KeyResultLinksSection'),
        ChecklistSection: createSectionStub('ChecklistSection'),
        Popover: PassthroughStub,
        PopoverTrigger: PassthroughStub,
        PopoverContent: PassthroughStub,
        LabelPicker: LabelPickerStub,
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

  it('re-emits identity updates and the current validation state', async () => {
    const wrapper = mountForm();

    expect(wrapper.emitted('update:validation')).toEqual([[{ isValid: true }]]);

    await wrapper.get('[data-stub="BasicInfoSection"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      id: 'template-1',
      title: 'Updated title',
    });
  });

  it('keeps Goal binding validity in the whole form state', async () => {
    const wrapper = mountForm();

    await wrapper.get('[data-stub="KeyResultLinksSection"]').trigger('click');

    expect(updateGoalBindingValidation).toHaveBeenCalledWith(true);
  });

  it('renders stable workspace sections with separate property badges and checklist', () => {
    const wrapper = mountForm();

    expect(wrapper.get('[data-testid="task-plan-identity-section"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="task-plan-property-chips"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="task-schedule-chip"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="task-recurrence-chip"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="task-goal-chip"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="task-reminder-chip"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="task-importance-chip"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="label-picker-stub"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="task-description-section"]').exists()).toBe(true);
    expect(wrapper.get('[data-stub="ChecklistSection"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="task-plan-property-editor"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="task-checklist-chip"]').exists()).toBe(false);
  });

  it('wires property editor validation callbacks through the anchored editors', async () => {
    const wrapper = mountForm();

    await wrapper.get('[data-stub="TimeConfigSection"]').trigger('click');
    await wrapper.get('[data-stub="RecurrenceSection"]').trigger('click');
    await wrapper.get('[data-stub="ReminderSection"]').trigger('click');
    await wrapper.get('[data-stub="ChecklistSection"]').trigger('click');

    expect(updateTimeValidation).toHaveBeenCalledWith(true);
    expect(updateRecurrenceValidation).toHaveBeenCalledWith(true);
    expect(updateReminderValidation).toHaveBeenCalledWith(true);
    expect(updateMetadataValidation).toHaveBeenCalledWith(true);
  });

  it('exposes the composable validate method to parent callers', async () => {
    const wrapper = mountForm();

    await (wrapper.vm as unknown as { validate: () => Promise<boolean> }).validate();

    expect(validateForm).toHaveBeenCalledTimes(1);
  });
});
