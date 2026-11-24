import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, within } from 'storybook/test';
import type { AIWorkflowRunView } from '@memoflow/ai-contracts';
import { AIWorkflowRunViewSchema } from '@memoflow/ai-contracts';
import AITaskWorkflowPanel from './AITaskWorkflowPanel.vue';

type PanelProps = InstanceType<typeof AITaskWorkflowPanel>['$props'];
type TaskWorkflowRun = Extract<AIWorkflowRunView, { kind: 'task.create' }>;

const reviewRun: TaskWorkflowRun = AIWorkflowRunViewSchema.parse({
  runId: 'workflow-task-review',
  kind: 'task.create',
  conversationId: 'conversation-task',
  status: 'suspended',
  suspension: {
    type: 'task_draft_review',
    ownerCreate: {
      taskId: 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001',
      draftRef: 'task:ship-review',
    },
    draft: {
      revision: 3,
      task: {
        draftRef: 'task:ship-review',
        title: 'Prepare the annual planning review pack',
        description: 'Collect the summary, open risks and the decision log for the review.',
        importance: 'Important',
        schedule: {
          kind: 'OneTime',
          date: '2026-09-18',
          timing: { kind: 'At', time: '09:00' },
        },
        reminderConfig: null,
        goalBinding: null,
        labels: [],
      },
      rationale:
        'The review needs one owned task with a fixed morning slot so the pack is ready before the meeting.',
      warnings: ['Confirm the decision log owner before the review.'],
    },
    warnings: ['Confirm the decision log owner before the review.'],
    revision: 3,
  },
  createdAt: 1,
  updatedAt: 2,
}) as TaskWorkflowRun;

const recoveryRun: TaskWorkflowRun = AIWorkflowRunViewSchema.parse({
  runId: 'workflow-task-recovery',
  kind: 'task.create',
  conversationId: 'conversation-task',
  status: 'suspended',
  suspension: {
    type: 'recovery_required',
    message: 'Task creation failed after the draft was accepted.',
    retryable: true,
    failures: [
      {
        operation: 'task_plan',
        draftRef: 'task:ship-review',
        code: 'SERVICE_UNAVAILABLE',
        message: 'Task store unavailable',
        retryable: true,
      },
    ],
  },
  createdAt: 1,
  updatedAt: 2,
}) as TaskWorkflowRun;

const completedRun: TaskWorkflowRun = AIWorkflowRunViewSchema.parse({
  runId: 'workflow-task-complete',
  kind: 'task.create',
  conversationId: 'conversation-task',
  status: 'completed',
  result: {
    workflowRunId: 'workflow-task-complete',
    revision: 3,
    status: 'success',
    referenceMap: { 'task:ship-review': 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440001' },
    failures: [],
    retryable: false,
  },
  createdAt: 1,
  updatedAt: 2,
}) as TaskWorkflowRun;

const baseProps: PanelProps = {
  toolMode: 'task-create',
  taskWorkflowRun: reviewRun,
  busy: false,
  ownerAttemptPending: false,
  ownerSubmitted: false,
  canRetryExecution: false,
  canAcceptPartialExecution: false,
  canCancelRemainingExecution: false,
};

const meta = {
  title: 'Business/AI/AITaskWorkflowPanel',
  component: AITaskWorkflowPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: baseProps,
  render: (args) => ({
    components: { AITaskWorkflowPanel },
    setup() {
      return { args };
    },
    template: `
      <div class="max-w-[42rem] bg-background p-4">
        <AITaskWorkflowPanel v-bind="args" />
      </div>
    `,
  }),
} satisfies Meta<typeof AITaskWorkflowPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Draft review: title, schedule kind, revision, rationale and the native review entry. */
export const DraftReview: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('task-workflow-panel')).toBeVisible();
    await expect(page.getByTestId('task-workflow-revision')).toHaveTextContent('rev 3');
    await expect(page.getByTestId('task-workflow-panel')).toHaveTextContent(
      'Prepare the annual planning review pack',
    );
    await expect(page.getByTestId('task-workflow-panel')).toHaveTextContent('One-time task');
    await expect(page.getByTestId('task-agent-confirm-run')).toBeVisible();
    await expect(page.getByTestId('task-open-native-review')).toBeVisible();
  },
};

/** Clarification stays display-only because the main Composer owns the answer. */
export const Clarification: Story = {
  args: {
    taskWorkflowRun: AIWorkflowRunViewSchema.parse({
      runId: 'workflow-task-clarification',
      kind: 'task.create',
      conversationId: 'conversation-task',
      status: 'suspended',
      suspension: {
        type: 'clarification_required',
        questions: ['When should the review pack be ready?', 'Should the pack include open risks?'],
      },
      createdAt: 1,
      updatedAt: 2,
    }) as TaskWorkflowRun,
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('task-workflow-clarification')).toHaveTextContent(
      'When should the review pack be ready?',
    );
    await expect(canvasElement.querySelector('textarea')).toBeNull();
  },
};

/** Recovery keeps every follow-up action visible for a partially applied run. */
export const Recovery: Story = {
  args: {
    taskWorkflowRun: recoveryRun,
    canRetryExecution: true,
    canAcceptPartialExecution: true,
    canCancelRemainingExecution: true,
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('task-workflow-recovery')).toBeVisible();
    await expect(page.getByTestId('task-workflow-recovery')).toHaveTextContent(
      'Workflow execution failed (SERVICE_UNAVAILABLE)',
    );
    await expect(page.getByTestId('task-agent-retry-execution')).toBeVisible();
    await expect(page.getByTestId('task-agent-accept-partial')).toBeVisible();
  },
};

/** Completion reports the product outcome and task count, never the raw receipt id. */
export const Completed: Story = {
  args: { taskWorkflowRun: completedRun },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('task-workflow-result')).toHaveTextContent('Success');
    await expect(page.getByTestId('task-workflow-result')).toHaveTextContent('one task');
    await expect(page.getByTestId('task-workflow-result')).not.toHaveTextContent(
      'ITaskPlanId_550e8400',
    );
  },
};
