import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, within } from 'storybook/test';
import type { AIWorkflowRunView } from '@memoflow/ai-contracts';
import { AIWorkflowRunViewSchema } from '@memoflow/ai-contracts';
import AIKnowledgeCapturePanel from './AIKnowledgeCapturePanel.vue';

type PanelProps = InstanceType<typeof AIKnowledgeCapturePanel>['$props'];
type KnowledgeCaptureRun = Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }>;

const recoveryRun: KnowledgeCaptureRun = AIWorkflowRunViewSchema.parse({
  runId: 'workflow-knowledge-recovery',
  kind: 'knowledge.capture',
  conversationId: 'conversation-knowledge',
  status: 'suspended',
  suspension: {
    type: 'recovery_required',
    message: 'The note could not be written to the local Vault.',
    retryable: true,
    failures: [
      {
        operation: 'knowledge_note',
        code: 'WRITE_FAILED',
        message: 'Vault write failed',
        retryable: true,
      },
    ],
  },
  createdAt: 1,
  updatedAt: 2,
}) as KnowledgeCaptureRun;

const completedRun: KnowledgeCaptureRun = AIWorkflowRunViewSchema.parse({
  runId: 'workflow-knowledge-complete',
  kind: 'knowledge.capture',
  conversationId: 'conversation-knowledge',
  status: 'completed',
  result: {
    workflowRunId: 'workflow-knowledge-complete',
    revision: 2,
    status: 'success',
    failures: [],
    retryable: false,
    noteName: 'Annual planning review brief',
    notePath: 'notes/annual-planning-review.md',
  },
  createdAt: 1,
  updatedAt: 2,
}) as KnowledgeCaptureRun;

const baseProps: PanelProps = {
  toolMode: 'knowledge-capture',
  knowledgeCaptureRun: recoveryRun,
  busy: false,
  canRetryExecution: true,
  canCancelRemainingExecution: true,
};

const meta = {
  title: 'Business/AI/AIKnowledgeCapturePanel',
  component: AIKnowledgeCapturePanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: baseProps,
  render: (args) => ({
    components: { AIKnowledgeCapturePanel },
    setup() {
      return { args };
    },
    template: `
      <div class="max-w-[40rem] bg-background p-4">
        <AIKnowledgeCapturePanel v-bind="args" />
      </div>
    `,
  }),
} satisfies Meta<typeof AIKnowledgeCapturePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Clarification stays display-only because the main Composer owns the answer. */
export const Clarification: Story = {
  args: {
    knowledgeCaptureRun: AIWorkflowRunViewSchema.parse({
      runId: 'workflow-knowledge-clarification',
      kind: 'knowledge.capture',
      conversationId: 'conversation-knowledge',
      status: 'suspended',
      suspension: {
        type: 'clarification_required',
        questions: ['Which project should own this note?', 'Should the note include open risks?'],
      },
      createdAt: 1,
      updatedAt: 2,
    }) as KnowledgeCaptureRun,
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('knowledge-capture-clarification')).toHaveTextContent(
      'Which project should own this note?',
    );
    await expect(canvasElement.querySelector('textarea')).toBeNull();
  },
};

/** A failed Vault write keeps retry and cancel-remaining available. */
export const Recovery: Story = {
  args: {
    knowledgeCaptureRun: recoveryRun,
    canRetryExecution: true,
    canCancelRemainingExecution: true,
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('knowledge-capture-workflow-recovery')).toBeVisible();
    await expect(page.getByTestId('knowledge-capture-workflow-recovery')).toHaveTextContent(
      'Workflow execution failed (WRITE_FAILED)',
    );
    await expect(page.getByTestId('knowledge-capture-agent-retry-execution')).toBeVisible();
    await expect(page.getByTestId('knowledge-capture-agent-cancel-remaining')).toBeVisible();
  },
};

/** Completion reports the saved note name and path in product language. */
export const Completed: Story = {
  args: { knowledgeCaptureRun: completedRun },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('knowledge-capture-workflow-result')).toHaveTextContent(
      'Saved to the knowledge base',
    );
    await expect(page.getByTestId('knowledge-capture-workflow-result')).toHaveTextContent(
      'notes/annual-planning-review.md',
    );
  },
};
