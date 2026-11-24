import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { nextTick, onMounted, ref } from 'vue';
import type { KeyResultClientDTO } from '@memoflow/goal-contracts';
import KeyResultDialog from './KeyResultDialog.vue';
import { storyKeyResultId } from './goal-story-fixtures';

const editingKeyResult: KeyResultClientDTO = {
  id: storyKeyResultId,
  title: 'Deep work sessions per week',
  description: 'Counted from the weekly review log.',
  progress: {
    aggregationMethod: 'Sum',
    initialValue: 0,
    currentValue: 7,
    targetValue: 12,
    unit: 'sessions',
  },
  target: { kind: 'quarter', year: 2026, quarter: 4 },
  progressPercentage: 58,
  isCompleted: false,
  weight: 4,
  order: 0,
  createdAt: Date.UTC(2026, 9, 1),
  updatedAt: Date.UTC(2026, 10, 19),
};

const meta = {
  title: 'Business/Goal/KeyResultDialog',
  component: KeyResultDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    onSubmit: fn(async () => true),
    goalStart: { kind: 'day', date: '2026-10-01' } as never,
    goalTarget: { kind: 'quarter', year: 2026, quarter: 4 },
  },
  render: (args, { parameters }) => ({
    components: { KeyResultDialog },
    setup() {
      const dialog = ref<InstanceType<typeof KeyResultDialog> | null>(null);
      onMounted(async () => {
        await nextTick();
        if (parameters.editingKeyResult) {
          dialog.value?.openForUpdateKeyResult(
            'IGoalId_story_goal_p1b',
            parameters.editingKeyResult as KeyResultClientDTO,
          );
        } else {
          dialog.value?.openForCreateKeyResult('IGoalId_story_goal_p1b');
        }
      });
      return { args, dialog };
    },
    template: `<div style="height: 900px" data-testid="key-result-story-surface">
      <KeyResultDialog ref="dialog" v-bind="args" />
    </div>`,
  }),
} satisfies Meta<typeof KeyResultDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EditingExisting: Story = {
  parameters: { editingKeyResult },
};

export const CreateEmpty: Story = {};

export const MeasurementConflict: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await canvas.findByTestId('draft-kr-title-input'),
      'Overlapping measurement window',
    );
    await userEvent.clear(canvas.getByTestId('draft-kr-initial-input'));
    await userEvent.type(canvas.getByTestId('draft-kr-initial-input'), '50');
    await userEvent.clear(canvas.getByTestId('draft-kr-target-input'));
    await userEvent.type(canvas.getByTestId('draft-kr-target-input'), '50');
    await userEvent.click(canvas.getByTestId('save-key-result-button'));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Initial value must differ from target value',
    );
    await expect(canvas.getByTestId('key-result-dialog')).toBeVisible();
  },
};

export const SubmissionFailureRetainsDraft: Story = {
  args: { onSubmit: fn(async () => false) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await canvas.findByTestId('draft-kr-title-input'),
      'Reliable delivery',
    );
    await userEvent.type(canvas.getByTestId('draft-kr-target-input'), '100');
    await userEvent.click(canvas.getByTestId('save-key-result-button'));
    await expect(await canvas.findByRole('alert')).toBeVisible();
    await expect(canvas.getByTestId('draft-kr-title-input')).toHaveValue('Reliable delivery');
  },
};
