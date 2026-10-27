import { ID_PREFIXES } from '@memoflow/shared-primitives';
import { computed, ref } from 'vue';
import {
  GoalDraftCheckpointContentSchema,
  GoalNativeDraftSchema,
  type GoalDraftCheckpointContent,
  type GoalNativeDraftDTO,
} from '@memoflow/goal-contracts';
import {
  GoalDraftCheckpointConflict,
  type GoalDraftCheckpointStore,
} from '../infrastructure/goal-draft-checkpoint.indexeddb';

/** The native editor owns content. This module owns only its offline checkpoint and CAS cursor. */
export function useGoalDraftCheckpoint(store?: GoalDraftCheckpointStore) {
  const status = ref<
    'idle' | 'loading' | 'saving' | 'saved' | 'conflict' | 'unavailable' | 'pending' | 'workflow'
  >('idle');
  const content = ref<GoalDraftCheckpointContent | null>(null);
  const scope = ref<string | null>(null);
  let version = 0;
  let intentCreateId: string = `${ID_PREFIXES.GoalId}_${crypto.randomUUID()}`;
  let generation = 0;
  let pending: GoalDraftCheckpointContent | null | undefined;
  let writing: Promise<boolean> | null = null;
  const blocked = computed(() =>
    ['loading', 'conflict', 'pending', 'workflow'].includes(status.value),
  );

  async function begin(): Promise<GoalDraftCheckpointContent | null> {
    const epoch = ++generation;
    pending = undefined;
    scope.value = store?.scope() ?? null;
    content.value = null;
    version = 0;
    status.value = 'idle';
    if (!store || !scope.value) return null;
    status.value = 'loading';
    if (writing) await writing;
    if (epoch !== generation) return null;
    try {
      const snapshot = await store.load(scope.value);
      if (epoch !== generation || store.scope() !== scope.value) return null;
      version = snapshot.version;
      content.value = snapshot.content;
      intentCreateId = snapshot.content?.createId ?? `${ID_PREFIXES.GoalId}_${crypto.randomUUID()}`;
      status.value =
        snapshot.content?.phase === 'submit_pending'
          ? 'pending'
          : snapshot.content?.workflowRunId
            ? 'workflow'
            : snapshot.content
              ? 'saved'
              : 'idle';
      return snapshot.content;
    } catch {
      if (epoch === generation) status.value = 'unavailable';
      return null;
    }
  }

  function drain(): Promise<boolean> {
    if (writing) return writing;
    const epoch = generation;
    const identityScope = scope.value;
    if (!store || !identityScope) return Promise.resolve(true);
    writing = (async () => {
      while (pending !== undefined && epoch === generation) {
        const next = pending;
        pending = undefined;
        if (JSON.stringify(next) === JSON.stringify(content.value)) continue;
        status.value = 'saving';
        try {
          const snapshot = await store.write(identityScope, version, next);
          if (epoch !== generation || store.scope() !== identityScope) return false;
          version = snapshot.version;
          content.value = snapshot.content;
          status.value = next?.phase === 'submit_pending' ? 'pending' : next ? 'saved' : 'idle';
        } catch (error) {
          pending = undefined;
          if (epoch === generation)
            status.value =
              error instanceof GoalDraftCheckpointConflict ? 'conflict' : 'unavailable';
          return false;
        }
      }
      return epoch === generation;
    })().finally(() => {
      writing = null;
    });
    return writing;
  }

  function capture(draft: GoalNativeDraftDTO, workflowRunId: string | null): void {
    if (
      !scope.value ||
      content.value?.phase === 'submit_pending' ||
      ['loading', 'conflict', 'pending', 'unavailable'].includes(status.value)
    )
      return;
    pending = GoalDraftCheckpointContentSchema.parse({
      createId: content.value?.createId ?? intentCreateId,
      draft,
      workflowRunId,
      phase: 'editing',
    });
    void drain();
  }

  async function prepare(
    draft: GoalNativeDraftDTO,
    createId?: string,
    workflowRunId: string | null = null,
  ): Promise<boolean> {
    if (!store || !scope.value) return true;
    draft = GoalNativeDraftSchema.parse(draft);
    if (
      content.value?.phase === 'submit_pending' &&
      (createId ?? content.value.createId) === content.value.createId &&
      workflowRunId === content.value.workflowRunId
    ) {
      if (JSON.stringify(draft) === JSON.stringify(content.value.draft)) return true;
      if (!workflowRunId || status.value !== 'saved') return false;
    }
    if (
      (blocked.value &&
        !(status.value === 'workflow' && workflowRunId === content.value?.workflowRunId)) ||
      status.value === 'unavailable'
    )
      return false;
    if (writing && !(await writing)) return false;
    pending = GoalDraftCheckpointContentSchema.parse({
      createId: createId ?? content.value?.createId ?? intentCreateId,
      draft,
      workflowRunId,
      phase: 'submit_pending',
    });
    return drain();
  }

  async function allowEditing(): Promise<boolean> {
    const saved = content.value;
    if (!saved) {
      status.value = 'idle';
      return true;
    }
    pending = GoalDraftCheckpointContentSchema.parse({
      ...saved,
      workflowRunId: null,
      phase: 'editing',
    });
    return drain();
  }

  async function detachTransientWorkflow(runId: string): Promise<boolean> {
    // A recreated renderer cannot inherit a local Agent's capability. Preserve
    // pending submission identity and phase: only the owner receipt can settle it.
    if (!runId.startsWith('local-agent:')) return false;
    if (writing && !(await writing)) return false;
    const saved = content.value;
    if (
      !saved ||
      saved.workflowRunId !== runId ||
      ['conflict', 'unavailable'].includes(status.value)
    )
      return false;
    pending = GoalDraftCheckpointContentSchema.parse({ ...saved, workflowRunId: null });
    return drain();
  }

  function adoptWorkflow(runId: string): boolean {
    if (!['workflow', 'pending'].includes(status.value) || content.value?.workflowRunId !== runId)
      return false;
    // A fresh native capability/fence is granted by the existing coordinator.
    status.value = 'saved';
    return true;
  }

  async function discard(): Promise<boolean> {
    if (!scope.value || !store) return true;
    if (['conflict', 'pending', 'workflow'].includes(status.value)) return false;
    if (writing && !(await writing)) return false;
    pending = null;
    return drain();
  }
  async function complete(): Promise<boolean> {
    if (!scope.value || !store) return true;
    if (writing && !(await writing)) return false;
    pending = null;
    return drain();
  }
  function stop() {
    generation++;
    pending = undefined;
    scope.value = null;
    content.value = null;
    status.value = 'idle';
  }
  return {
    status,
    content,
    scope,
    blocked,
    begin,
    capture,
    prepare,
    allowEditing,
    detachTransientWorkflow,
    adoptWorkflow,
    discard,
    complete,
    stop,
  };
}
