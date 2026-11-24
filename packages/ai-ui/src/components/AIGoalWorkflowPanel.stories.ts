import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, within } from 'storybook/test';
import type { AIWorkflowRunView } from '@memoflow/ai-contracts';
import { AIWorkflowRunViewSchema } from '@memoflow/ai-contracts';
import { GoalPlanDraftSchema } from '@memoflow/ai-contracts';
import AIGoalWorkflowPanel from './AIGoalWorkflowPanel.vue';

type PanelProps = InstanceType<typeof AIGoalWorkflowPanel>['$props'];
type GoalWorkflowRun = Extract<AIWorkflowRunView, { kind: 'goal.create' }>;

const draft = GoalPlanDraftSchema.parse({
  revision: 2,
  goal: {
    draftRef: 'goal',
    name: 'Ship the annual planning review',
    summary: 'Make the durable Goal workflow the only owner of goal.create.',
    status: 'InProgress',
    start: { kind: 'day', date: '2026-09-01' },
    target: { kind: 'quarter', year: 2026, quarter: 4 },
    labels: ['planning', 'ai-vnext'],
  },
  keyResults: [
    {
      draftRef: 'kr:reference-journey',
      title: 'Pass the reference journey',
      description: 'Every review path is exercised end to end.',
      aggregationMethod: 'Sum',
      initialValue: 0,
      currentValue: 0,
      targetValue: 1,
      unit: 'journey',
      weight: 5,
    },
    {
      draftRef: 'kr:owner-handoff',
      title: 'Hand the draft to the native Goal owner',
      description: null,
      aggregationMethod: 'Sum',
      initialValue: 0,
      currentValue: 0,
      targetValue: 1,
      unit: 'review',
      weight: 3,
    },
  ],
  tasks: [
    {
      draftRef: 'task:regression-gate',
      title: 'Run the regression gate',
      description: 'Run the canonical checks before asking for review.',
      importance: 'Important',
      schedule: {
        kind: 'Recurring',
        startDate: '2026-09-01',
        timing: { kind: 'At', time: '09:00' },
        recurrence: {
          frequency: 'Daily',
          interval: 1,
          byWeekday: [],
          end: { kind: 'Never' },
        },
      },
      labels: [],
      goalRef: 'goal',
      keyResultRef: 'kr:reference-journey',
      contribution: { value: 1, trigger: 'EachCompletion' },
    },
  ],
  knowledge: [
    {
      draftRef: 'note:goal-brief',
      mode: 'create',
      title: 'Goal Brief',
      markdown: '# Goal Brief\n\nWhy this goal matters and how the quarter closes.',
      targetSubpath: 'goals/ship-annual-planning.md',
      sourceRefs: ['notes/adr-099.md'],
    },
    {
      draftRef: 'note:existing-architecture',
      mode: 'linkExisting',
      title: 'Existing Architecture',
      knowledgeDocument: {
        knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440010',
        documentId: 'kdoc_550e8400-e29b-41d4-a716-446655440011',
      },
    },
  ],
  rationale: 'A single durable owner prevents duplicate domain mutation.',
  warnings: ['Review the generated schedule before approval.'],
});

const reviewRun: GoalWorkflowRun = AIWorkflowRunViewSchema.parse({
  runId: 'workflow-goal-review',
  kind: 'goal.create',
  conversationId: 'conversation-goal',
  status: 'suspended',
  suspension: {
    type: 'goal_draft_review',
    ownerCreate: {
      goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440001',
      keyResultIds: {
        'kr:reference-journey': 'KeyResultId_550e8400-e29b-41d4-a716-446655440002',
      },
    },
    draft,
    warnings: draft.warnings,
    revision: draft.revision,
    researchEvidence: [
      {
        query: 'quarterly planning review milestones',
        intent: 'timeline',
        summary: 'The planning office publishes the review milestones every quarter.',
        trust: 'external_untrusted',
        provenance: 'external',
        sources: [
          {
            title: 'Planning office milestones',
            url: 'https://example.com/planning-milestones',
          },
        ],
      },
    ],
  },
  createdAt: 1,
  updatedAt: 2,
}) as GoalWorkflowRun;

const recoveryRun: GoalWorkflowRun = AIWorkflowRunViewSchema.parse({
  runId: 'workflow-goal-recovery',
  kind: 'goal.create',
  conversationId: 'conversation-goal',
  status: 'suspended',
  suspension: {
    type: 'recovery_required',
    message: 'Some mutations failed.',
    retryable: true,
    failures: [
      {
        operation: 'knowledge_link',
        draftRef: 'note:existing-architecture',
        code: 'SERVICE_UNAVAILABLE',
        message: 'Knowledge relation unavailable',
        retryable: true,
      },
    ],
  },
  createdAt: 1,
  updatedAt: 2,
}) as GoalWorkflowRun;

const completedRun: GoalWorkflowRun = AIWorkflowRunViewSchema.parse({
  runId: 'workflow-goal-complete',
  kind: 'goal.create',
  conversationId: 'conversation-goal',
  status: 'completed',
  result: {
    workflowRunId: 'workflow-goal-complete',
    revision: 2,
    status: 'success',
    referenceMap: {
      goal: 'GoalId_550e8400-e29b-41d4-a716-446655440000',
      'kr:reference-journey': 'KeyResultId_550e8400-e29b-41d4-a716-446655440001',
      'task:regression-gate': 'TaskPlanId_550e8400-e29b-41d4-a716-446655440002',
      'note:goal-brief': 'kdoc_550e8400-e29b-41d4-a716-446655440003',
    },
    relationIds: { 'note:goal-brief': 'relation-1' },
    goalVersion: 2,
    appliedGoalStatus: 'InProgress',
    failures: [],
    retryable: false,
  },
  createdAt: 1,
  updatedAt: 2,
}) as GoalWorkflowRun;

const baseProps: PanelProps = {
  toolMode: 'goal-create',
  goalClarification: null,
  goalWorkflowRun: reviewRun,
  editableGoal: {
    name: draft.goal.name,
    summary: draft.goal.summary ?? '',
    status: draft.goal.status,
    start: draft.goal.start ?? null,
    target: draft.goal.target ?? null,
  },
  editableKeyResults: draft.keyResults.map((item) => ({
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
  })),
  editableTasks: draft.tasks,
  editableKnowledge: draft.knowledge,
  knowledgeAnswer: null,
  formatExecutionOutcome: (status) => status,
};

const meta = {
  title: 'Business/AI/AIGoalWorkflowPanel',
  component: AIGoalWorkflowPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: baseProps,
  render: (args) => ({
    components: { AIGoalWorkflowPanel },
    setup() {
      return { args };
    },
    template: `
      <div class="max-w-[46rem] bg-background p-4">
        <AIGoalWorkflowPanel v-bind="args" />
      </div>
    `,
  }),
} satisfies Meta<typeof AIGoalWorkflowPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Clarification is display-only; the main Composer owns the answers. */
export const Clarification: Story = {
  args: {
    goalWorkflowRun: null,
    goalClarification: {
      needsClarification: true,
      rationale: 'One detail is still needed before the draft can be prepared.',
      questions: [
        {
          question: 'Which quarter should this Goal target?',
          context: 'The draft currently points at Q4 2026.',
        },
        {
          question: 'Should the review include external planning milestones?',
          context: null,
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('goal-clarification-panel')).toBeVisible();
    await expect(page.getByTestId('goal-clarification-panel')).toHaveTextContent(
      'Which quarter should this Goal target?',
    );
    await expect(page.queryByTestId('goal-workflow-panel')).not.toBeInTheDocument();
  },
};

/** Draft review: revision, warnings, research evidence and supporting proposals in one surface. */
export const DraftReview: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('goal-workflow-panel')).toBeVisible();
    await expect(page.getByTestId('goal-workflow-revision')).toHaveTextContent('rev 2');
    await expect(page.getByTestId('goal-workflow-warnings')).toHaveTextContent(
      'Review the generated schedule before approval.',
    );
    await expect(page.getByTestId('goal-workflow-research-evidence')).toBeVisible();
    await expect(page.getByTestId('goal-workflow-task-proposal')).toBeVisible();
    await expect(page.getByTestId('goal-open-native-review')).toBeVisible();
  },
};

/** Partial failures surface the retry, accept-partial and cancel-remaining choices. */
export const Recovery: Story = {
  args: {
    goalWorkflowRun: recoveryRun,
    canRetryExecution: true,
    canAcceptPartialExecution: true,
    canCancelRemainingExecution: true,
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('goal-workflow-recovery')).toBeVisible();
    await expect(page.getByTestId('goal-workflow-failure')).toHaveTextContent(
      'Execution failed (SERVICE_UNAVAILABLE)',
    );
    await expect(page.getByTestId('goal-agent-retry-execution')).toBeVisible();
    await expect(page.getByTestId('goal-agent-accept-partial')).toBeVisible();
  },
};

/** Completion shows the applied receipt without raw canonical identifiers. */
export const Completed: Story = {
  args: { goalWorkflowRun: completedRun },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('goal-workflow-result')).toBeVisible();
    await expect(page.getByTestId('goal-workflow-result')).toHaveTextContent('success');
    await expect(page.getByTestId('goal-workflow-result')).not.toHaveTextContent('GoalId_550e8400');
  },
};
