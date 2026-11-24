import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, within } from 'storybook/test';
import type { AIWorkflowRunView } from '@memoflow/ai-contracts';
import { AIWorkflowRunViewSchema } from '@memoflow/ai-contracts';
import AIKnowledgeCapturePanel from './AIKnowledgeCapturePanel.vue';

type PanelProps = InstanceType<typeof AIKnowledgeCapturePanel>['$props'];
type KnowledgeCaptureRun = Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }>;

const reviewRun: KnowledgeCaptureRun = AIWorkflowRunViewSchema.parse({
  runId: 'workflow-knowledge-review',
  kind: 'knowledge.capture',
  conversationId: 'conversation-knowledge',
  status: 'suspended',
  suspension: {
    type: 'knowledge_draft_review',
    revision: 2,
    warnings: [],
    draft: {
      revision: 2,
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440530',
      title: 'Annual planning review brief',
      topic:
        'Summary of the planning review, open risks and the decisions that still need an owner.',
      markdown:
        '# Annual planning review brief\n\n## Decisions\n\n- Keep the quarterly review cadence.\n- Assign the risk log to the planning owner.\n',
      targetSubpath: 'notes/annual-planning-review.md',
      tags: ['planning', 'review', 'q4'],
      duplicateRisk: '',
    },
  },
  createdAt: 1,
  updatedAt: 2,
}) as KnowledgeCaptureRun;

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
  knowledgeCaptureRun: reviewRun,
  busy: false,
  canRetryExecution: false,
  canCancelRemainingExecution: false,
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

/** Draft review: title, topic, tags and the native Repository review entry. */
export const DraftReview: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByTestId('knowledge-capture-workflow-panel')).toBeVisible();
    await expect(page.getByTestId('knowledge-capture-workflow-revision')).toHaveTextContent(
      'rev 2',
    );
    await expect(page.getByTestId('knowledge-capture-workflow-panel')).toHaveTextContent(
      'Annual planning review brief',
    );
    await expect(page.getByTestId('knowledge-capture-workflow-panel')).toHaveTextContent(
      'planning',
    );
    await expect(page.getByTestId('knowledge-capture-open-native-review')).toBeVisible();
  },
};

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
      'Execution failed (WRITE_FAILED)',
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
