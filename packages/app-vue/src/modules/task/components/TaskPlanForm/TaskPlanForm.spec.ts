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
    timeConfig: {
      timeType: 'AllDay',
    },
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
        BasicInfoSection: createSectionStub('BasicInfoSection', (value) => ({
          ...value,
          title: 'Updated title',
        })),
        TimeConfigSection: createSectionStub('TimeConfigSection'),
        RecurrenceSection: createSectionStub('RecurrenceSection'),
        ReminderSection: createSectionStub('ReminderSection'),
        MetadataSection: createSectionStub('MetadataSection'),
        KeyResultLinksSection: createSectionStub('KeyResultLinksSection'),
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

    await wrapper.get('[data-stub="KeyResultLinksSection"]').trigger('click');

    expect(updateGoalBindingValidation).toHaveBeenCalledWith({ isValid: true });
  });

  it('keeps advanced reminder and metadata sections collapsed until requested', async () => {
    const wrapper = mountForm();

    expect(wrapper.find('[data-stub="ReminderSection"]').exists()).toBe(false);
    expect(wrapper.find('[data-stub="MetadataSection"]').exists()).toBe(false);

    await wrapper.get('[data-testid="task-form-advanced-toggle"]').trigger('click');

    expect(wrapper.find('[data-stub="ReminderSection"]').exists()).toBe(true);
    expect(wrapper.find('[data-stub="MetadataSection"]').exists()).toBe(true);
  });

  it('exposes the composable validate method to parent callers', async () => {
    const wrapper = mountForm();

    await (wrapper.vm as unknown as { validate: () => Promise<boolean> }).validate();

    expect(validateForm).toHaveBeenCalledTimes(1);
  });
});
