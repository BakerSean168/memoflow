import { defineComponent, h, ref, type Ref } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GoalPlanDraftSchema,
  type AIWorkflowRunView,
  type GoalPlanDraft,
} from '@memoflow/contracts/ai';
import { AI_WORKFLOW_STORAGE_KEY, useAIWorkflowPersistence } from './useAIWorkflowPersistence';
import {
  createEmptyGoalDraft,
  type EditableGoal,
  type EditableGoalKnowledge,
  type EditableGoalTask,
  type EditableKeyResult,
  type GoalWorkflowStage,
  type PersistedWorkflowState,
  type WorkflowMode,
} from './types';

type GoalRun = Extract<AIWorkflowRunView, { kind: 'goal.create' }>;

function makeDraft(revision: number, name = 'Canonical goal'): GoalPlanDraft {
  return GoalPlanDraftSchema.parse({
    revision,
    goal: {
      draftRef: 'goal',
      name,
      summary: 'Canonical summary',
      status: 'Planned',
      startDate: null,
      target: null,
      labels: [],
    },
    keyResults: [],
    tasks: [],
    knowledge: [],
    rationale: 'Canonical rationale',
    warnings: [],
  });
}

function makeGoalRun(overrides: Partial<Omit<GoalRun, 'kind'>> = {}): GoalRun {
  return {
    runId: 'run-goal-1',
    conversationId: 'conversation-1',
    kind: 'goal.create',
    status: 'running',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function projectDraft(state: TestState, run: GoalRun, draft: GoalPlanDraft): void {
  state.toolMode.value = 'goal-create';
  state.goalWorkflowStage.value = 'confirm';
  state.goalWorkflowRun.value = run;
  state.editableGoal.value = {
    name: draft.goal.name,
    summary: draft.goal.summary ?? '',
    status: draft.goal.status,
    startDate: draft.goal.startDate ?? null,
    target: draft.goal.target ?? null,
  };
  state.editableKeyResults.value = [];
  state.editableTasks.value = [];
  state.editableKnowledge.value = [];
}

type TestState = {
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
  showGoalDraftEditor: Ref<boolean>;
};

function setup() {
  const state: TestState = {
    toolMode: ref<WorkflowMode>('chat'),
    goalWorkflowStage: ref<GoalWorkflowStage>('collect'),
    goalWorkflowRun: ref<AIWorkflowRunView | null>(null),
    taskWorkflowRun: ref<AIWorkflowRunView | null>(null),
    knowledgeCaptureRun: ref<AIWorkflowRunView | null>(null),
    clarificationAnswers: ref<string[]>([]),
    editableGoal: ref<EditableGoal>(createEmptyGoalDraft()),
    editableKeyResults: ref<EditableKeyResult[]>([]),
    editableTasks: ref<EditableGoalTask[]>([]),
    editableKnowledge: ref<EditableGoalKnowledge[]>([]),
    showGoalDraftEditor: ref(false),
  };
  let persistence!: ReturnType<typeof useAIWorkflowPersistence>;
  mount(
    defineComponent({
      setup() {
        persistence = useAIWorkflowPersistence({
          ...state,
          resetWorkflowArtifacts() {
            state.toolMode.value = 'chat';
            state.goalWorkflowStage.value = 'collect';
            state.goalWorkflowRun.value = null;
            state.taskWorkflowRun.value = null;
            state.knowledgeCaptureRun.value = null;
            state.clarificationAnswers.value = [];
            state.editableGoal.value = createEmptyGoalDraft();
            state.editableKeyResults.value = [];
            state.editableTasks.value = [];
            state.editableKnowledge.value = [];
            state.showGoalDraftEditor.value = false;
          },
        });
        return () => h('div');
      },
    }),
  );
  return { state, persistence };
}

describe('useAIWorkflowPersistence', () => {
  beforeEach(() => localStorage.clear());

  it('persists only a run pointer and retires full v2 snapshots', () => {
    localStorage.setItem(
      'ai:conversation-workflow-map:v2',
      JSON.stringify({
        'conversation-1': {
          mode: 'goal-create',
          goalWorkflowRun: makeGoalRun({ status: 'suspended', result: undefined }),
        },
      }),
    );
    const { state, persistence } = setup();
    const run = makeGoalRun({
      status: 'suspended',
      suspension: { type: 'recovery_required', message: 'retry', retryable: true, failures: [] },
      result: undefined,
      updatedAt: 8,
    });
    state.toolMode.value = 'goal-create';
    state.goalWorkflowRun.value = run;

    persistence.persistWorkflowState('conversation-1');

    const stored = JSON.parse(localStorage.getItem(AI_WORKFLOW_STORAGE_KEY) ?? '{}') as Record<
      string,
      PersistedWorkflowState
    >;
    expect(stored['conversation-1']).toEqual({ activeRunId: 'run-goal-1' });
    expect(JSON.stringify(stored)).not.toContain('suspension');
    expect(JSON.stringify(stored)).not.toContain('status');
    expect(JSON.stringify(stored)).not.toContain('result');
    expect(JSON.stringify(stored)).not.toContain('goalWorkflowRun');
    expect(localStorage.getItem('ai:conversation-workflow-map:v2')).toBeNull();

    const restored = persistence.restoreWorkflowState('conversation-1');
    expect(restored).toEqual({ activeRunId: 'run-goal-1' });
    expect(state.goalWorkflowRun.value).toBeNull();
    expect(state.toolMode.value).toBe('chat');
  });

  it('stores a revision-bound unsaved editor overlay without making it workflow truth', () => {
    const { state, persistence } = setup();
    const draft = makeDraft(3);
    const run = makeGoalRun({
      status: 'suspended',
      suspension: { type: 'goal_draft_review', draft, warnings: [], revision: 3 },
      updatedAt: 30,
    });
    projectDraft(state, run, draft);
    state.editableGoal.value.name = 'Unsaved local edit';

    persistence.persistWorkflowState('conversation-1');

    const stored = JSON.parse(localStorage.getItem(AI_WORKFLOW_STORAGE_KEY) ?? '{}') as Record<
      string,
      PersistedWorkflowState
    >;
    expect(stored['conversation-1'].activeRunId).toBe(run.runId);
    expect(stored['conversation-1'].editorOverlay).toMatchObject({
      kind: 'goal.create',
      phase: 'draft-review',
      runId: run.runId,
      revision: 3,
      editableGoal: { name: 'Unsaved local edit' },
    });
    expect(JSON.stringify(stored)).not.toContain('goalWorkflowRun');

    const restored = persistence.restoreWorkflowState('conversation-1');
    expect(restored?.editorOverlay).toBeDefined();
    expect(state.editableGoal.value.name).toBe('');
    expect(persistence.applyEditorOverlay(restored?.editorOverlay, run)).toBe(true);
    expect(state.editableGoal.value.name).toBe('Unsaved local edit');
    expect(state.showGoalDraftEditor.value).toBe(true);
  });

  it('restores suspended HITL answers only as a matching local editor overlay', () => {
    const { state, persistence } = setup();
    const run = makeGoalRun({
      status: 'suspended',
      suspension: { type: 'clarification_required', questions: ['What matters?'], round: 1 },
      updatedAt: 7,
    });
    state.toolMode.value = 'goal-create';
    state.goalWorkflowRun.value = run;
    state.clarificationAnswers.value = ['Protect focus time'];

    persistence.persistWorkflowState('conversation-1');
    const persisted = persistence.restoreWorkflowState('conversation-1');

    expect(persistence.applyEditorOverlay(persisted?.editorOverlay, run)).toBe(true);
    expect(state.clarificationAnswers.value).toEqual(['Protect focus time']);
    expect(
      persistence.applyEditorOverlay(persisted?.editorOverlay, {
        ...run,
        updatedAt: 8,
      }),
    ).toBe(false);
  });

  it('rejects a stale overlay and clears it when the runtime has a newer revision', () => {
    const { state, persistence } = setup();
    const oldDraft = makeDraft(2);
    const oldRun = makeGoalRun({
      status: 'suspended',
      suspension: { type: 'goal_draft_review', draft: oldDraft, warnings: [], revision: 2 },
      updatedAt: 20,
    });
    projectDraft(state, oldRun, oldDraft);
    state.editableGoal.value.name = 'Stale edit';
    persistence.persistWorkflowState('conversation-1');
    const persisted = persistence.restoreWorkflowState('conversation-1');

    const newDraft = makeDraft(3, 'New authoritative goal');
    const newRun = makeGoalRun({
      status: 'suspended',
      suspension: { type: 'goal_draft_review', draft: newDraft, warnings: [], revision: 3 },
      updatedAt: 30,
    });
    expect(persistence.applyEditorOverlay(persisted?.editorOverlay, newRun)).toBe(false);
    expect(state.editableGoal.value.name).toBe('');

    projectDraft(state, newRun, newDraft);
    persistence.persistWorkflowState('conversation-1');
    const rebased = JSON.parse(localStorage.getItem(AI_WORKFLOW_STORAGE_KEY) ?? '{}') as Record<
      string,
      PersistedWorkflowState
    >;
    expect(rebased['conversation-1']).toEqual({ activeRunId: newRun.runId });
  });

  it('rebases away an overlay after a successful runtime revision update', () => {
    const { state, persistence } = setup();
    const draft = makeDraft(1);
    const run = makeGoalRun({
      status: 'suspended',
      suspension: { type: 'goal_draft_review', draft, warnings: [], revision: 1 },
    });
    projectDraft(state, run, draft);
    state.editableGoal.value.name = 'Local edit';
    persistence.persistWorkflowState('conversation-1');

    const nextDraft = makeDraft(2, 'Accepted runtime edit');
    const nextRun = makeGoalRun({
      status: 'suspended',
      suspension: { type: 'goal_draft_review', draft: nextDraft, warnings: [], revision: 2 },
      updatedAt: 2,
    });
    // This models projectRun(next) after edit_structured/approve: editor refs
    // now equal the authoritative runtime revision.
    projectDraft(state, nextRun, nextDraft);
    persistence.persistWorkflowState('conversation-1');

    const stored = JSON.parse(localStorage.getItem(AI_WORKFLOW_STORAGE_KEY) ?? '{}') as Record<
      string,
      PersistedWorkflowState
    >;
    expect(stored['conversation-1']).toEqual({ activeRunId: nextRun.runId });
  });
});
