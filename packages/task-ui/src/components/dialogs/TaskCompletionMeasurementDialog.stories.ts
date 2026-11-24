import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, within } from 'storybook/test';
import { provide, ref } from 'vue';
import type { TaskOccurrenceClientDTO } from '@memoflow/task-contracts';
import { GOAL_SERVICE_KEY } from '@task-ui-test-host/di/keys';
import type { IGoalService } from '@task-ui-test-host/di/types';
import type { useTaskOccurrenceActionCoordinator } from '../../composables/useTaskOccurrenceActionCoordinator';
import TaskCompletionMeasurementDialog from './TaskCompletionMeasurementDialog.vue';
import { createStoryOccurrence } from './task-story-fixtures';

type MeasurementStoryParameters = {
  fail?: boolean;
  busy?: boolean;
  suggestedValue?: number | null;
};

function installMeasurementGoalPort() {
  provide(GOAL_SERVICE_KEY, {
    getGoalRecordsByKeyResult: async () => ({
      ok: true,
      data: {
        records: [],
        previewContext: {
          keyResultId: 'IKeyResultId_story_kr_p1b',
          trackingBaseValue: 7,
          initialValue: 0,
          currentValue: 7,
          targetValue: 12,
          aggregationMethod: 'Sum',
          unit: 'sessions',
          aggregationSnapshot: { count: 6, sum: 7, max: 2, min: 1, last: 2 },
        },
      },
    }),
  } as unknown as IGoalService);
}

function createStoryCoordinator(parameters: MeasurementStoryParameters) {
  const occurrence = createStoryOccurrence({ status: 'Completed' });
  const pendingMeasurement = ref<{
    occurrenceId: string;
    goalId: string;
    keyResultId: string;
    suggestedValue: number | null;
  } | null>({
    occurrenceId: String(occurrence.id),
    goalId: 'IGoalId_story_goal_p1b',
    keyResultId: 'IKeyResultId_story_kr_p1b',
    suggestedValue: parameters.suggestedValue ?? 3,
  });
  const busyOccurrenceId = ref<string | null>(parameters.busy ? String(occurrence.id) : null);
  return {
    busyOccurrenceId,
    pendingMeasurement,
    submitMeasurement: async () => (parameters.fail ? null : occurrence),
    completeWithoutMeasurement: async () => (parameters.fail ? null : occurrence),
    cancelMeasurement: () => {
      pendingMeasurement.value = null;
    },
  } as unknown as ReturnType<typeof useTaskOccurrenceActionCoordinator>;
}

const meta = {
  title: 'Business/Task/TaskCompletionMeasurementDialog',
  component: TaskCompletionMeasurementDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: { coordinator: createStoryCoordinator({}) },
  render: (_args, { parameters }) => ({
    components: { TaskCompletionMeasurementDialog },
    setup() {
      installMeasurementGoalPort();
      const coordinator = createStoryCoordinator(parameters as MeasurementStoryParameters);
      return { coordinator };
    },
    template: `<div style="height: 820px" data-testid="measurement-story-surface">
      <TaskCompletionMeasurementDialog :coordinator="coordinator" />
    </div>`,
  }),
} satisfies Meta<typeof TaskCompletionMeasurementDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SuggestedMeasurement: Story = {};

export const WithoutSuggestion: Story = {
  parameters: { suggestedValue: null },
};

export const AlreadyBusy: Story = {
  parameters: { busy: true },
};

export const FailureKeepsDialogOpen: Story = {
  parameters: { fail: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByTestId('task-complete-only'));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Completion failed. Your measurement is retained; try again.',
    );
    await expect(canvas.getByTestId('task-completion-measurement-dialog')).toBeVisible();
  },
};
