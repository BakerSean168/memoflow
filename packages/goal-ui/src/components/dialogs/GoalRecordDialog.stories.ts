import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, within } from 'storybook/test';
import { nextTick, onMounted, provide, ref } from 'vue';
import { createMockGoalMutationReceipt } from '@memoflow/goal-contracts/test-support/goal.mock';
import type { GoalRecordClientDTO } from '@memoflow/goal-contracts';
import { GOAL_SERVICE_KEY, LABEL_SERVICE_KEY } from '@goal-ui-test-host/di/keys';
import type { IGoalService, ILabelService } from '@goal-ui-test-host/di/types';
import { useGoalStore } from '../../stores/goal-store';
import GoalRecordDialog from './GoalRecordDialog.vue';
import {
  createStoryGoal,
  storyGoalId,
  storyKeyResultId,
  storyPreviewContext,
  storyRecords,
} from './goal-story-fixtures';

type RecordStoryParameters = {
  failSave?: boolean;
  prefill?: boolean;
};

function installGoalRecordPorts(parameters: RecordStoryParameters) {
  provide(GOAL_SERVICE_KEY, {
    // Partial owner port: unexpected calls fail instead of fabricating success.
    getGoalRecordsByKeyResult: async () => ({
      ok: true,
      data: { records: storyRecords, previewContext: storyPreviewContext },
    }),
    createGoalRecord: async (goalId: string, keyResultId: string, request: { value: number }) =>
      parameters.failSave
        ? { ok: false, error: { code: 'OFFLINE', message: 'Story double is offline' } }
        : {
            ok: true,
            data: createMockGoalMutationReceipt(
              { ...createStoryGoal(), id: goalId as never },
              {
                recordChanges: {
                  upserted: [
                    {
                      id: 'IGoalRecordId_story_created' as never,
                      goalId: goalId as never,
                      keyResultId: keyResultId as never,
                      value: request.value,
                      valueAfter: 7 + request.value,
                      authorship: 'Manual',
                      source: null,
                      recordedAt: Date.now(),
                      comment: null,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    },
                  ],
                  removedIds: [],
                },
              },
            ),
          },
    updateGoalRecord: async () => ({
      ok: true,
      data: createMockGoalMutationReceipt({ ...createStoryGoal(), id: storyGoalId }),
    }),
  } as unknown as IGoalService);
  provide(LABEL_SERVICE_KEY, {
    listLabels: async () => ({ ok: true, data: [] }),
  } as unknown as ILabelService);
}

const meta = {
  title: 'Business/Goal/GoalRecordDialog',
  component: GoalRecordDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: (args, { parameters }) => ({
    components: { GoalRecordDialog },
    setup() {
      installGoalRecordPorts(parameters);
      useGoalStore().setGoals([createStoryGoal()]);
      const dialog = ref<InstanceType<typeof GoalRecordDialog> | null>(null);
      onMounted(async () => {
        await nextTick();
        dialog.value?.openDialog(
          storyGoalId,
          storyKeyResultId,
          (parameters.record as GoalRecordClientDTO | undefined) ?? undefined,
        );
        if (parameters.prefill) {
          await nextTick();
          const amount = document.querySelector<HTMLInputElement>('#change-amount');
          const note = document.querySelector<HTMLTextAreaElement>('#record-note');
          if (amount) {
            amount.value = '3';
            amount.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (note) {
            note.value = 'Third deep-work block landed before lunch.';
            note.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      });
      return { dialog };
    },
    template: `<div style="height: 820px" data-testid="goal-record-story-surface">
      <GoalRecordDialog ref="dialog" />
    </div>`,
  }),
} satisfies Meta<typeof GoalRecordDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyToSave: Story = {
  args: {},
  parameters: { prefill: true },
};

export const CreateEmpty: Story = {
  args: {},
};

export const EditingManualRecord: Story = {
  args: {},
  parameters: {
    record: storyRecords[0],
  },
};

export const ReadOnlyAutomaticRecord: Story = {
  args: {},
  parameters: {
    record: {
      ...storyRecords[1],
      authorship: 'TaskAutomatic',
      source: { type: 'TASK_INSTANCE', id: 'occurrence_story_1' },
    },
  },
};

export const SaveFailureKeepsDraft: Story = {
  args: {},
  parameters: { failSave: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const amount = await canvas.findByLabelText('Change this time');
    await userEvent.clear(amount);
    await userEvent.type(amount, '4');
    await userEvent.click(canvas.getByTestId('save-goal-record'));
    await expect(await canvas.findByRole('alert')).toBeVisible();
    await expect(canvas.getByTestId('goal-record-dialog')).toBeVisible();
    await expect(amount).toHaveValue(4);
  },
};

