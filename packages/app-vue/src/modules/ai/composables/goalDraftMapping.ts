import {
  GoalPlanDraftContentSchema,
  GoalPlanningSeedSchema,
  GoalPlanGoalSchema,
  type AIWorkflowRunView,
  type GoalPlanDraft,
  type GoalPlanDraftContent,
} from '@memoflow/contracts/ai';
import type { GoalNativeEditSession } from '@memoflow/goal-ui';
import type { EditableGoalKnowledge, EditableGoalTask } from './types';
export type GoalNativeProjection = {
  mode: 'clarification' | 'review';
  draft: GoalPlanDraft;
  revision: number;
  ownerCreate?: {
    goalId: string;
    keyResultIds: Record<string, string>;
  };
};

export function goalNativeProjection(
  run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>,
): GoalNativeProjection | null {
  const suspension = run.suspension;
  if (suspension?.type === 'goal_draft_review') {
    return {
      mode: 'review',
      draft: suspension.draft,
      revision: suspension.revision,
      ownerCreate: suspension.ownerCreate,
    };
  }
  if (suspension?.type === 'clarification_required' && suspension.candidateDraft) {
    return {
      mode: 'clarification',
      draft: suspension.candidateDraft,
      revision: suspension.candidateDraft.revision,
    };
  }
  return null;
}

export function canonicalDraftContent(draft: GoalPlanDraft): GoalPlanDraftContent {
  const { revision: _revision, ...content } = draft;
  return GoalPlanDraftContentSchema.parse({
    ...content,
    goal: {
      ...content.goal,
      summary: content.goal.summary ?? null,
      description: content.goal.description ?? null,
      reminderConfig: content.goal.reminderConfig ?? null,
      start: content.goal.start ?? null,
      target: content.goal.target ?? null,
    },
    keyResults: content.keyResults.map((item) => ({
      ...item,
      description: item.description ?? null,
      target: item.target ?? null,
      unit: item.unit ?? null,
    })),
  });
}

export function buildEditedGoalDraftContent(input: {
  draft: GoalPlanDraft;
  native: ReturnType<GoalNativeEditSession['readDraftState']>['draft'];
  labels: readonly { id: string; name: string }[];
  pendingLabelNames: readonly string[];
  keyResultRefs: ReadonlyMap<string, string>;
  tasks: readonly EditableGoalTask[];
  knowledge: readonly EditableGoalKnowledge[];
}): GoalPlanDraftContent {
  return GoalPlanDraftContentSchema.parse(editedGoalDraftContent(input));
}

export function buildGoalPlanningSeed(
  input: Omit<Parameters<typeof buildEditedGoalDraftContent>[0], 'draft'>,
) {
  const status = GoalPlanGoalSchema.shape.status.parse(input.native.status);
  return GoalPlanningSeedSchema.parse(
    editedGoalDraftContent({
      ...input,
      draft: {
        revision: 1,
        goal: { draftRef: 'goal', name: input.native.name, status, labels: [] },
        keyResults: [],
        tasks: [],
        knowledge: [],
        rationale: '',
        warnings: [],
      },
    }),
  );
}

function editedGoalDraftContent(input: Parameters<typeof buildEditedGoalDraftContent>[0]) {
  const { draft, native, labels, pendingLabelNames, keyResultRefs } = input;
  const goal = {
    ...draft.goal,
    name: native.name,
    summary: native.summary.trim() || null,
    status: native.status,
    start: native.start,
    target: native.target,
    description: native.description.trim() || null,
    reminderConfig: native.reminderConfig,
    labels: [
      ...new Set([
        ...native.labelIds.map((id) => {
          const label = labels.find((item) => item.id === id);
          if (!label) throw new Error('Selected Goal label is unavailable');
          return label.name;
        }),
        ...pendingLabelNames,
      ]),
    ],
  };
  const used = new Set([
    ...draft.keyResults.map((item) => item.draftRef),
    ...keyResultRefs.values(),
  ]);
  const keyResults = native.keyResults.map((item) => {
    let draftRef = item.id ? keyResultRefs.get(item.id) : undefined;
    if (!draftRef) {
      let suffix = 1;
      while (used.has(`kr:new-${suffix}`)) suffix += 1;
      draftRef = `kr:new-${suffix}`;
      used.add(draftRef);
    }
    return {
      draftRef,
      title: item.title,
      description: item.description?.trim() || null,
      aggregationMethod: item.calculationMethod,
      initialValue: item.initialValue,
      currentValue: item.currentValue,
      targetValue: item.targetValue,
      target: item.target ?? null,
      unit: item.unit?.trim() || null,
      weight: item.weight,
    };
  });
  return {
    goal,
    keyResults,
    tasks: input.tasks,
    knowledge: input.knowledge,
    rationale: draft.rationale,
    warnings: [...draft.warnings],
  };
}
