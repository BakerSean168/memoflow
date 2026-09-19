import { ref, watch, type Ref } from 'vue';
import {
  GoalPlanDraftContentSchema,
  type AIWorkflowRunView,
  type GoalPlanDraft,
} from '@memoflow/contracts/ai';
import {
  type EditableGoal,
  type EditableKeyResult,
  type EditableGoalKnowledge,
  type EditableGoalTask,
  type GoalWorkflowStage,
  type PersistedWorkflowEditorOverlay,
  type PersistedWorkflowState,
  type WorkflowMode,
} from './types';

/**
 * A recoverable UI pointer and optional unsaved editor overlay are the only
 * workflow values that may cross a browser reload. Mastra owns the run.
 */
export const AI_WORKFLOW_STORAGE_KEY = 'ai:conversation-workflow-map:v3';
const RETIRED_WORKFLOW_STORAGE_KEYS = ['ai:conversation-workflow-map:v2'] as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isObjectArray(value: unknown): value is JsonRecord[] {
  return Array.isArray(value) && value.every(isRecord);
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseEditorOverlay(value: unknown): PersistedWorkflowEditorOverlay | undefined {
  if (!isRecord(value) || value.kind !== 'goal.create' || !isNonEmptyString(value.runId)) {
    return undefined;
  }
  if (!isNonNegativeInteger(value.revision)) return undefined;

  if (value.phase === 'clarification') {
    if (
      !Array.isArray(value.answers) ||
      !value.answers.every((answer): answer is string => typeof answer === 'string')
    ) {
      return undefined;
    }
    return {
      kind: 'goal.create',
      phase: 'clarification',
      runId: value.runId,
      revision: value.revision,
      answers: [...value.answers],
    };
  }

  if (value.phase !== 'draft-review') return undefined;
  const editableGoal = value.editableGoal;
  if (
    !isRecord(editableGoal) ||
    typeof editableGoal.name !== 'string' ||
    typeof editableGoal.summary !== 'string' ||
    typeof editableGoal.status !== 'string' ||
    !isNullableString(editableGoal.startDate) ||
    (editableGoal.target !== null && !isRecord(editableGoal.target)) ||
    !isObjectArray(value.editableKeyResults) ||
    !isObjectArray(value.editableTasks) ||
    !isObjectArray(value.editableKnowledge)
  ) {
    return undefined;
  }

  return {
    kind: 'goal.create',
    phase: 'draft-review',
    runId: value.runId,
    revision: value.revision,
    editableGoal: {
      name: editableGoal.name,
      summary: editableGoal.summary,
      status: editableGoal.status as EditableGoal['status'],
      startDate: editableGoal.startDate as EditableGoal['startDate'],
      target: editableGoal.target as EditableGoal['target'],
    },
    // The complete overlay is validated against the authoritative draft before
    // it is applied. These casts only preserve the JSON object shape here.
    editableKeyResults: value.editableKeyResults as EditableKeyResult[],
    editableTasks: value.editableTasks as EditableGoalTask[],
    editableKnowledge: value.editableKnowledge as EditableGoalKnowledge[],
  };
}

function parseWorkflowState(value: unknown): PersistedWorkflowState | undefined {
  if (!isRecord(value) || !isNonEmptyString(value.activeRunId)) return undefined;
  const editorOverlay =
    value.editorOverlay === undefined ? undefined : parseEditorOverlay(value.editorOverlay);
  return {
    activeRunId: value.activeRunId,
    ...(editorOverlay ? { editorOverlay } : {}),
  };
}

function runKey(run: AIWorkflowRunView | null): string {
  if (!run) return '';
  let suspensionRevision = '';
  if (run.suspension?.type === 'goal_draft_review') {
    suspensionRevision = String(run.suspension.draft.revision);
  } else if (run.suspension && 'revision' in run.suspension) {
    suspensionRevision = String(run.suspension.revision);
  }
  return [
    run.runId,
    run.status,
    run.updatedAt,
    run.suspension?.type ?? '',
    suspensionRevision,
  ].join(':');
}

function editableGoalFromDraft(draft: GoalPlanDraft): EditableGoal {
  return {
    name: draft.goal.name,
    summary: draft.goal.summary ?? '',
    status: draft.goal.status,
    startDate: draft.goal.startDate ?? null,
    target: draft.goal.target ?? null,
  };
}

function editableKeyResultsFromDraft(draft: GoalPlanDraft): EditableKeyResult[] {
  return draft.keyResults.map((item) => ({
    draftRef: item.draftRef,
    title: item.title,
    description: item.description ?? '',
    aggregationMethod: item.aggregationMethod,
    initialValue: item.initialValue,
    currentValue: item.currentValue,
    targetValue: item.targetValue,
    target: item.target ?? null,
    unit: item.unit ?? '',
    weight: item.weight,
  }));
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export interface UseAIWorkflowPersistenceOptions {
  toolMode: Ref<WorkflowMode>;
  goalWorkflowStage: Ref<GoalWorkflowStage>;
  goalWorkflowRun: Ref<AIWorkflowRunView | null>;
  taskWorkflowRun: Ref<AIWorkflowRunView | null>;
  knowledgeCaptureRun: Ref<AIWorkflowRunView | null>;
  clarificationAnswers: Ref<string[]>;
  editableGoal: Ref<EditableGoal>;
  editableKeyResults: Ref<EditableKeyResult[]>;
  editableTasks: Ref<EditableGoalTask[]>;
  editableKnowledge: Ref<EditableGoalKnowledge[]>;
  /** Ephemeral editor visibility; deliberately not persisted. */
  showGoalDraftEditor: Ref<boolean>;
  resetWorkflowArtifacts: () => void;
}

export function useAIWorkflowPersistence(options: UseAIWorkflowPersistenceOptions) {
  const suspendWorkflowPersistence = ref(false);

  function retireLegacyWorkflowStorage(): void {
    for (const key of RETIRED_WORKFLOW_STORAGE_KEYS) localStorage.removeItem(key);
  }

  function readWorkflowStorage(): Record<string, PersistedWorkflowState> {
    retireLegacyWorkflowStorage();
    try {
      const raw = localStorage.getItem(AI_WORKFLOW_STORAGE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return {};

      const states: Record<string, PersistedWorkflowState> = {};
      for (const [conversationId, value] of Object.entries(parsed)) {
        if (!conversationId) continue;
        const state = parseWorkflowState(value);
        if (state) states[conversationId] = state;
      }
      return states;
    } catch {
      return {};
    }
  }

  function writeWorkflowStorage(next: Record<string, PersistedWorkflowState>): void {
    retireLegacyWorkflowStorage();
    if (Object.keys(next).length === 0) {
      localStorage.removeItem(AI_WORKFLOW_STORAGE_KEY);
      return;
    }
    localStorage.setItem(AI_WORKFLOW_STORAGE_KEY, JSON.stringify(next));
  }

  function currentWorkflowRun(): AIWorkflowRunView | null {
    if (options.toolMode.value === 'goal-create') return options.goalWorkflowRun.value;
    if (options.toolMode.value === 'task-create') return options.taskWorkflowRun.value;
    if (options.toolMode.value === 'knowledge-capture') {
      return options.knowledgeCaptureRun.value;
    }
    return null;
  }

  function unsavedEditorOverlay(
    run: AIWorkflowRunView,
  ): PersistedWorkflowEditorOverlay | undefined {
    if (run.kind !== 'goal.create' || run.status !== 'suspended' || !run.suspension) {
      return undefined;
    }

    if (run.suspension.type === 'clarification_required') {
      const answers = [...options.clarificationAnswers.value];
      if (answers.every((answer) => answer.trim().length === 0)) return undefined;
      return {
        kind: 'goal.create',
        phase: 'clarification',
        runId: run.runId,
        revision: run.updatedAt,
        answers,
      };
    }

    if (run.suspension.type !== 'goal_draft_review') return undefined;
    const canonical = {
      editableGoal: editableGoalFromDraft(run.suspension.draft),
      editableKeyResults: editableKeyResultsFromDraft(run.suspension.draft),
      editableTasks: run.suspension.draft.tasks,
      editableKnowledge: run.suspension.draft.knowledge,
    };
    const current = {
      editableGoal: options.editableGoal.value,
      editableKeyResults: options.editableKeyResults.value,
      editableTasks: options.editableTasks.value,
      editableKnowledge: options.editableKnowledge.value,
    };
    if (sameJson(current, canonical)) return undefined;

    return {
      kind: 'goal.create',
      phase: 'draft-review',
      runId: run.runId,
      revision: run.suspension.draft.revision,
      editableGoal: cloneSerializable(options.editableGoal.value),
      editableKeyResults: cloneSerializable(options.editableKeyResults.value),
      editableTasks: cloneSerializable(options.editableTasks.value),
      editableKnowledge: cloneSerializable(options.editableKnowledge.value),
    };
  }

  function snapshotWorkflowState(): PersistedWorkflowState | null {
    const run = currentWorkflowRun();
    if (!run) return null;
    const editorOverlay = unsavedEditorOverlay(run);
    return {
      activeRunId: run.runId,
      ...(editorOverlay ? { editorOverlay } : {}),
    };
  }

  function persistWorkflowState(conversationId: string): void {
    if (!conversationId) return;
    const stored = readWorkflowStorage();
    const snapshot = snapshotWorkflowState();
    if (!snapshot) delete stored[conversationId];
    else stored[conversationId] = snapshot;
    writeWorkflowStorage(stored);
  }

  function clearWorkflowState(conversationId: string): void {
    if (!conversationId) return;
    const stored = readWorkflowStorage();
    if (!(conversationId in stored)) return;
    delete stored[conversationId];
    writeWorkflowStorage(stored);
  }

  /**
   * Reset presentation state and return only the recoverable pointer/overlay.
   * The caller must fetch the pointer through workflowRuntime.get before it
   * projects anything into the UI.
   */
  function restoreWorkflowState(conversationId: string): PersistedWorkflowState | null {
    const entry = readWorkflowStorage()[conversationId] ?? null;
    options.resetWorkflowArtifacts();
    options.toolMode.value = 'chat';
    options.goalWorkflowStage.value = 'collect';
    return entry;
  }

  function applyEditorOverlay(
    overlay: PersistedWorkflowEditorOverlay | undefined,
    run: AIWorkflowRunView,
  ): boolean {
    if (!overlay || overlay.runId !== run.runId || run.kind !== 'goal.create') return false;
    if (run.status !== 'suspended' || !run.suspension) return false;

    if (
      overlay.phase === 'clarification' &&
      run.suspension.type === 'clarification_required' &&
      overlay.revision === run.updatedAt &&
      overlay.answers.length === run.suspension.questions.length
    ) {
      options.clarificationAnswers.value = [...overlay.answers];
      return true;
    }

    if (overlay.phase !== 'draft-review' || run.suspension.type !== 'goal_draft_review') {
      return false;
    }
    if (overlay.revision !== run.suspension.draft.revision) return false;

    const parsed = GoalPlanDraftContentSchema.safeParse({
      goal: {
        ...run.suspension.draft.goal,
        ...overlay.editableGoal,
        summary: overlay.editableGoal.summary.trim() || null,
      },
      keyResults: overlay.editableKeyResults.map((item) => ({
        ...item,
        description: item.description.trim() || null,
        target: item.target ?? null,
        unit: item.unit.trim() || null,
      })),
      tasks: overlay.editableTasks,
      knowledge: overlay.editableKnowledge,
      rationale: run.suspension.draft.rationale,
      warnings: run.suspension.draft.warnings,
    });
    if (!parsed.success) return false;

    const draft = parsed.data;
    options.editableGoal.value = editableGoalFromDraft({
      ...draft,
      revision: run.suspension.draft.revision,
    });
    options.editableKeyResults.value = editableKeyResultsFromDraft({
      ...draft,
      revision: run.suspension.draft.revision,
    });
    options.editableTasks.value = cloneSerializable(draft.tasks);
    options.editableKnowledge.value = cloneSerializable(draft.knowledge);
    options.showGoalDraftEditor.value = true;
    return true;
  }

  function bindPersistenceWatcher(chatConversationId: Ref<string>): void {
    watch(
      () =>
        [
          chatConversationId.value,
          options.toolMode.value,
          options.goalWorkflowStage.value,
          runKey(options.goalWorkflowRun.value),
          runKey(options.taskWorkflowRun.value),
          runKey(options.knowledgeCaptureRun.value),
          JSON.stringify(options.clarificationAnswers.value),
          JSON.stringify(options.editableGoal.value),
          JSON.stringify(options.editableKeyResults.value),
          JSON.stringify(options.editableTasks.value),
          JSON.stringify(options.editableKnowledge.value),
        ].join('|'),
      () => {
        if (!chatConversationId.value || suspendWorkflowPersistence.value) return;
        persistWorkflowState(chatConversationId.value);
      },
    );
  }

  return {
    suspendWorkflowPersistence,
    persistWorkflowState,
    clearWorkflowState,
    restoreWorkflowState,
    applyEditorOverlay,
    bindPersistenceWatcher,
  };
}
