import { readonly, ref } from 'vue';
import type { TaskGoalBindingDTO } from '@memoflow/contracts/task';
import { useTaskOccurrences } from './useTaskOccurrences';

export type TaskOccurrenceOperations = Pick<
  ReturnType<typeof useTaskOccurrences>,
  | 'completeOccurrence'
  | 'uncompleteOccurrence'
  | 'markOccurrenceMissed'
  | 'skipOccurrence'
  | 'setOccurrenceChecklistItem'
>;

export interface TaskCompletionMeasurementSession {
  occurrenceId: string;
  goalId: string;
  keyResultId: string;
  suggestedValue: number | null;
}

export function useTaskOccurrenceActionCoordinator(
  options: {
    operations?: TaskOccurrenceOperations;
    resolveGoalBinding?: (occurrenceId: string) => TaskGoalBindingDTO | null | undefined;
    afterSuccess?: () => void | Promise<unknown>;
  } = {},
) {
  const operations = options.operations ?? useTaskOccurrences();
  const busyOccurrenceId = ref<string | null>(null);

  const pendingMeasurement = ref<TaskCompletionMeasurementSession | null>(null);

  async function run(
    id: string,
    action: () => ReturnType<TaskOccurrenceOperations['completeOccurrence']>,
    measurementAction = false,
  ) {
    // One in-flight action per surface, including its owner's success refresh.
    if (busyOccurrenceId.value !== null || (pendingMeasurement.value && !measurementAction))
      return null;
    busyOccurrenceId.value = id;
    try {
      const result = await action();
      if (result) await options.afterSuccess?.();
      return result;
    } finally {
      busyOccurrenceId.value = null;
    }
  }

  async function requestComplete(id: string) {
    if (busyOccurrenceId.value !== null || pendingMeasurement.value) return null;
    const binding = options.resolveGoalBinding?.(id);
    if (binding?.progressRule?.mode === 'Prompt' && binding.goalId && binding.keyResultId) {
      pendingMeasurement.value = {
        occurrenceId: id,
        goalId: String(binding.goalId),
        keyResultId: String(binding.keyResultId),
        suggestedValue: binding.progressRule.suggestedValue ?? null,
      };
      return null;
    }
    return run(id, () => operations.completeOccurrence(id));
  }

  async function finishMeasurement(measurement?: { value: number; note: string }) {
    const session = pendingMeasurement.value;
    if (!session || busyOccurrenceId.value !== null) return null;
    return run(
      session.occurrenceId,
      async () => {
        const result = measurement
          ? await operations.completeOccurrence(session.occurrenceId, {
              goalMeasurement: measurement,
            })
          : await operations.completeOccurrence(session.occurrenceId);
        // The command succeeded even if the host's subsequent refresh fails.
        if (result) pendingMeasurement.value = null;
        return result;
      },
      true,
    );
  }

  function submitMeasurement(value: number, note: string) {
    if (!Number.isFinite(value) || note.length > 500) return Promise.resolve(null);
    return finishMeasurement({ value, note });
  }

  function cancelMeasurement() {
    if (busyOccurrenceId.value === null) pendingMeasurement.value = null;
  }

  return {
    busyOccurrenceId: readonly(busyOccurrenceId),
    pendingMeasurement: readonly(pendingMeasurement),
    submitMeasurement,
    completeWithoutMeasurement: () => finishMeasurement(),
    cancelMeasurement,
    requestComplete,
    requestUncomplete: (id: string) => run(id, () => operations.uncompleteOccurrence(id)),
    requestMissed: (id: string) => run(id, () => operations.markOccurrenceMissed(id)),
    requestSkip: (id: string) => run(id, () => operations.skipOccurrence(id)),
    requestChecklistChange: (
      id: string,
      definitionId: string,
      completed: boolean,
      expectedVersion: number,
    ) =>
      run(id, () =>
        operations.setOccurrenceChecklistItem(id, { definitionId, completed, expectedVersion }),
      ),
  };
}
