import { ref, watch, type Ref } from 'vue';
import { normalizeReminderTimeOfDay } from '@memoflow/utils/shared';
import type { AIWorkflowRunView } from '@memoflow/contracts/ai';
import {
  createEmptyGoalDraft,
  type EditableGoal,
  type EditableKeyResult,
  type EditableGoalReminder,
  type EditableGoalTaskPlan,
  type GoalWorkflowStage,
  type KnowledgeAnswer,
  type PersistedWorkflowEntry,
  type WorkflowMode,
  normalizeWorkflowMode,
} from './types';

const WORKFLOW_STORAGE_KEY = 'ai:conversation-workflow-map';

export interface UseAIWorkflowPersistenceOptions {
  toolMode: Ref<WorkflowMode>;
  goalWorkflowStage: Ref<GoalWorkflowStage>;
  goalWorkflowRun: Ref<AIWorkflowRunView | null>;
  taskWorkflowRun: Ref<AIWorkflowRunView | null>;
  knowledgeCaptureRun: Ref<AIWorkflowRunView | null>;
  knowledgeAnswer: Ref<KnowledgeAnswer | null>;
  clarificationAnswers: Ref<string[]>;
  editableGoal: Ref<EditableGoal>;
  editableKeyResults: Ref<EditableKeyResult[]>;
  editableTaskPlans: Ref<EditableGoalTaskPlan[]>;
  editableReminders: Ref<EditableGoalReminder[]>;
  showGoalDraftEditor: Ref<boolean>;
  resetWorkflowArtifacts: () => void;
}

export function useAIWorkflowPersistence(options: UseAIWorkflowPersistenceOptions) {
  const suspendWorkflowPersistence = ref(false);

  function readWorkflowStorage(): Record<string, PersistedWorkflowEntry> {
    try {
      const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, PersistedWorkflowEntry>)
        : {};
    } catch {
      return {};
    }
  }

  function writeWorkflowStorage(next: Record<string, PersistedWorkflowEntry>) {
    localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(next));
  }

  function normalizeReminderDraft(item: EditableGoalReminder): EditableGoalReminder {
    return { ...item, timeOfDay: normalizeReminderTimeOfDay(item.timeOfDay) };
  }

  function inferGoalWorkflowStage(entry: PersistedWorkflowEntry | undefined | null): GoalWorkflowStage {
    const run = entry?.goalWorkflowRun;
    if (run?.kind === 'goal.create') {
      if (run.status === 'suspended' && run.suspension?.type === 'clarification_required') return 'clarification';
      if (run.status === 'suspended' && run.suspension?.type === 'goal_draft_review') return 'confirm';
      if (run.status === 'suspended' && run.suspension?.type === 'recovery_required') return 'execute';
      if (run.status === 'completed' || run.status === 'cancelled' || run.status === 'failed') return 'result';
      return 'plan';
    }
    if (entry?.goalWorkflowStage) return entry.goalWorkflowStage;
    return 'collect';
  }

  function snapshotWorkflowEntry(): PersistedWorkflowEntry | null {
    if (options.toolMode.value === 'chat') return null;
    return {
      mode: options.toolMode.value,
      goalWorkflowStage:
        options.toolMode.value === 'goal-create' ? options.goalWorkflowStage.value : undefined,
      goalWorkflowRun: options.goalWorkflowRun.value,
      taskWorkflowRun: options.taskWorkflowRun.value,
      knowledgeCaptureRun: options.knowledgeCaptureRun.value,
      knowledgeAnswer: options.knowledgeAnswer.value,
      clarificationAnswers: [...options.clarificationAnswers.value],
      editableGoal: { ...options.editableGoal.value },
      editableKeyResults: options.editableKeyResults.value.map((item) => ({ ...item })),
      editableTaskPlans: options.editableTaskPlans.value.map((item) => ({ ...item })),
      editableReminders: options.editableReminders.value.map((item) => ({ ...item })),
      showGoalDraftEditor: options.showGoalDraftEditor.value,
    };
  }

  function persistWorkflowState(conversationId: string) {
    if (!conversationId) return;
    const stored = readWorkflowStorage();
    const snapshot = snapshotWorkflowEntry();
    if (!snapshot) delete stored[conversationId];
    else stored[conversationId] = snapshot;
    writeWorkflowStorage(stored);
  }

  function clearWorkflowState(conversationId: string) {
    if (!conversationId) return;
    const stored = readWorkflowStorage();
    if (!(conversationId in stored)) return;
    delete stored[conversationId];
    writeWorkflowStorage(stored);
  }

  function restoreWorkflowState(conversationId: string) {
    const entry = readWorkflowStorage()[conversationId];
    options.resetWorkflowArtifacts();
    if (!entry) {
      options.toolMode.value = 'chat';
      return;
    }

    const mode = normalizeWorkflowMode(entry.mode);
    options.toolMode.value = mode;
    options.goalWorkflowStage.value = mode === 'goal-create' ? inferGoalWorkflowStage(entry) : 'collect';
    options.goalWorkflowRun.value = entry.goalWorkflowRun ?? null;
    options.taskWorkflowRun.value = entry.taskWorkflowRun ?? null;
    options.knowledgeCaptureRun.value = entry.knowledgeCaptureRun ?? null;
    options.knowledgeAnswer.value = entry.knowledgeAnswer ?? null;
    options.clarificationAnswers.value = [...(entry.clarificationAnswers ?? [])];
    options.editableGoal.value = {
      ...createEmptyGoalDraft(),
      ...entry.editableGoal,
    };
    options.editableKeyResults.value = (entry.editableKeyResults ?? []).map((item) => ({ ...item }));
    options.editableTaskPlans.value = (entry.editableTaskPlans ?? []).map((item) => ({ ...item }));
    options.editableReminders.value = (entry.editableReminders ?? []).map(normalizeReminderDraft);
    options.showGoalDraftEditor.value = Boolean(entry.showGoalDraftEditor);
  }

  function bindPersistenceWatcher(chatConversationId: Ref<string>) {
    watch(
      () => [
        chatConversationId.value,
        options.toolMode.value,
        options.goalWorkflowStage.value,
        options.showGoalDraftEditor.value ? '1' : '0',
        JSON.stringify(options.goalWorkflowRun.value),
        JSON.stringify(options.taskWorkflowRun.value),
        JSON.stringify(options.knowledgeCaptureRun.value),
        JSON.stringify(options.knowledgeAnswer.value),
        JSON.stringify(options.clarificationAnswers.value),
        JSON.stringify(options.editableGoal.value),
        JSON.stringify(options.editableKeyResults.value),
        JSON.stringify(options.editableTaskPlans.value),
        JSON.stringify(options.editableReminders.value),
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
    bindPersistenceWatcher,
  };
}
