import { readonly, ref } from 'vue';
import { useTaskOccurrences } from './useTaskOccurrences';

export type TaskOccurrenceOperations = Pick<
  ReturnType<typeof useTaskOccurrences>,
  | 'completeOccurrence'
  | 'uncompleteOccurrence'
  | 'markOccurrenceMissed'
  | 'skipOccurrence'
  | 'setOccurrenceChecklistItem'
>;

export function useTaskOccurrenceActionCoordinator(
  options: {
    operations?: TaskOccurrenceOperations;
    afterSuccess?: () => void | Promise<unknown>;
  } = {},
) {
  const operations = options.operations ?? useTaskOccurrences();
  const busyOccurrenceId = ref<string | null>(null);

  async function run(
    id: string,
    action: () => ReturnType<TaskOccurrenceOperations['completeOccurrence']>,
  ) {
    // One in-flight action per surface, including its owner's success refresh.
    if (busyOccurrenceId.value !== null) return null;
    busyOccurrenceId.value = id;
    try {
      const result = await action();
      if (result) await options.afterSuccess?.();
      return result;
    } finally {
      busyOccurrenceId.value = null;
    }
  }

  function requestComplete(id: string) {
    // TASK-3301: decide completion-time KR measurement here before invoking the owner command.
    return run(id, () => operations.completeOccurrence(id));
  }

  return {
    busyOccurrenceId: readonly(busyOccurrenceId),
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
