import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { provide, ref } from 'vue';
import { createMockGoalMutationReceipt } from '@memoflow/goal-contracts/test-support/goal.mock';
import type { CreateGoalReq } from '@memoflow/goal-contracts';
import { GOAL_SERVICE_KEY, LABEL_SERVICE_KEY } from '@goal-ui-test-host/di/keys';
import type { IGoalService, ILabelService } from '@goal-ui-test-host/di/types';
import GoalDialog from './GoalDialog.vue';

const meta = {
  title: 'Business/Goal/GoalDialog',
  component: GoalDialog,
  tags: ['ci-interaction'],
  args: { open: true, mode: 'create', presentation: 'panel' },
  render: (args, { parameters }) => ({
    components: { GoalDialog },
    setup() {
      // Deliberately partial I/O ports: unexpected calls fail instead of returning
      // success. Real owner validation, draft state and rendering remain intact.
      provide(GOAL_SERVICE_KEY, {
        createGoal: async (request: CreateGoalReq) =>
          parameters.saveSucceeds
            ? { ok: true, data: createMockGoalMutationReceipt({ name: request.name }) }
            : { ok: false, error: { code: 'OFFLINE', message: 'Offline story fixture' } },
      } as unknown as IGoalService);
      provide(LABEL_SERVICE_KEY, {
        listLabels: async () => ({ ok: true, data: [] }),
      } as unknown as ILabelService);
      const open = ref(true);
      return { args, open };
    },
    template:
      '<main style="display:flex;height:800px"><aside style="width:40%"><textarea aria-label="Chat composer" /></aside><section style="position:relative;flex:1"><p>Goal background</p><GoalDialog v-bind="args" :open="open" @created="open = false" /></section></main>',
  }),
} satisfies Meta<typeof GoalDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ModelessCreate: Story = {
  args: { onCreated: fn() },
  parameters: { saveSucceeds: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const editor = await canvas.findByTestId('goal-panel-form');
    await expect(editor).toHaveAttribute('aria-modal', 'false');
    await userEvent.click(canvas.getByTestId('pane-scoped-dialog-backdrop'));
    await expect(editor).toBeVisible();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Chat composer' }), 'Still typing');
    await expect(editor).toBeVisible();
    await expect(canvas.getByTestId('save-goal-button')).toBeDisabled();
    await userEvent.type(canvas.getByTestId('goal-name-input'), 'Manual panel Goal');
    await userEvent.click(canvas.getByTestId('save-goal-button'));
    await expect(args.onCreated).toHaveBeenCalledOnce();
    await expect(canvas.queryByTestId('goal-panel-form')).not.toBeInTheDocument();
  },
};

export const ValidationRecovery: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const name = await canvas.findByTestId('goal-name-input');
    await userEvent.click(name);
    await userEvent.tab();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByTestId('goal-name-limit-error')).toHaveTextContent(
      'Goal name is required',
    );
    await userEvent.type(name, 'Corrected goal');
    await expect(canvas.queryByTestId('goal-name-limit-error')).not.toBeInTheDocument();
    await expect(name).not.toHaveAttribute('aria-describedby');
    await expect(canvas.getByTestId('goal-panel-form')).toHaveAttribute('aria-modal', 'false');
  },
};

export const SaveFailureRetainsDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const name = await canvas.findByTestId('goal-name-input');
    await userEvent.type(name, 'Keep failed goal');
    await userEvent.click(canvas.getByTestId('save-goal-button'));
    await expect(await canvas.findByTestId('goal-submit-error')).toBeVisible();
    await expect(name).toHaveValue('Keep failed goal');
  },
};
