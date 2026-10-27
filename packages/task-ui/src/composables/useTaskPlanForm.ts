import { ref, computed } from 'vue';

/**
 * Aggregates validation state from all TaskPlanForm sections.
 * Each section emits `update:validation` with a boolean; the parent form
 * passes the value into the corresponding `update*Validation` callback.
 */
export function useTaskPlanForm() {
  const basicValid = ref(false);
  const timeValid = ref(true);
  const recurrenceValid = ref(true);
  const reminderValid = ref(true);
  const goalBindingValid = ref(true);
  const metadataValid = ref(true);

  const isFormValid = computed(
    () =>
      basicValid.value &&
      timeValid.value &&
      recurrenceValid.value &&
      reminderValid.value &&
      goalBindingValid.value &&
      metadataValid.value,
  );

  const updateBasicValidation = (valid: boolean) => {
    basicValid.value = valid;
  };
  const updateTimeValidation = (valid: boolean) => {
    timeValid.value = valid;
  };
  const updateRecurrenceValidation = (valid: boolean) => {
    recurrenceValid.value = valid;
  };
  const updateReminderValidation = (valid: boolean) => {
    reminderValid.value = valid;
  };
  const updateGoalBindingValidation = (valid: boolean) => {
    goalBindingValid.value = valid;
  };
  const updateMetadataValidation = (valid: boolean) => {
    metadataValid.value = valid;
  };

  const validateForm = (): boolean => isFormValid.value;

  return {
    isFormValid,
    validateForm,
    updateBasicValidation,
    updateTimeValidation,
    updateRecurrenceValidation,
    updateReminderValidation,
    updateGoalBindingValidation,
    updateMetadataValidation,
  };
}
