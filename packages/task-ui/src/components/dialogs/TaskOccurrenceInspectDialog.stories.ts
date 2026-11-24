import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import type { TaskOccurrenceClientDTO } from '@memoflow/task-contracts';
import { TASK_SERVICE_KEY } from '@task-ui-test-host/di/keys';
import type { ITaskService } from '@task-ui-test-host/di/types';
import TaskOccurrenceInspectDialog from './TaskOccurrenceInspectDialog.vue';
import {
  createStoryOccurrence,
  createStoryWorkspace,
  storyGoalContext,
} from './task-story-fixtures';

type InspectStoryParameters = {
  occurrence: TaskOccurrenceClientDTO;
  busy?: boolean;
  goalContext?: 'available' | 'missing';
};

function installInspectPorts(parameters: InspectStoryParameters) {
  provide(TASK_SERVICE_KEY, {
    getWorkspace: async () => ({
      ok: true,
      data: createStoryWorkspace(parameters.goalContext === 'missing' ? null : storyGoalContext),
    }),
  } as unknown as ITaskService);
}

const meta = {
  title: 'Business/Task/TaskOccurrenceInspectDialog',
  component: TaskOccurrenceInspectDialog,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  args: {
    modelValue: true,
    occurrence: createStoryOccurrence(),
    planName: 'Morning focus block',
    busy: false,
  },
  render: (_args, { parameters }) => ({
    components: { TaskOccurrenceInspectDialog },
    setup() {
      installInspectPorts(parameters as InspectStoryParameters);
      return { parameters };
    },
    template: `<div style="height: 900px" data-testid="inspect-story-surface">
      <TaskOccurrenceInspectDialog
        :model-value="true"
        :occurrence="parameters.occurrence"
        plan-name="Morning focus block"
        :busy="parameters.busy ?? false"
      />
    </div>`,
  }),
} satisfies Meta<typeof TaskOccurrenceInspectDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PendingWithChecklist: Story = {
  parameters: { occurrence: createStoryOccurrence() },
};

export const CompletedWithFeedback: Story = {
  parameters: {
    occurrence: createStoryOccurrence({
      status: 'Completed',
      actualStartAt: Date.UTC(2026, 10, 24, 9, 28),
      result: {
        kind: 'Completed',
        recordedAt: Date.UTC(2026, 10, 24, 11, 45),
        actualDurationMinutes: 137,
        rating: 4,
        note: 'The architecture log was already current; most time went into the rollout risks section.',
      },
    }),
  },
};

export const MissedWithoutGoalContext: Story = {
  parameters: {
    goalContext: 'missing',
    occurrence: createStoryOccurrence({
      status: 'Missed',
      dueAt: Date.UTC(2026, 10, 23, 9, 30),
      isOverdue: true,
      result: {
        kind: 'Missed',
        recordedAt: Date.UTC(2026, 10, 24, 8, 0),
        reason: 'Calendar conflict with the quarterly review.',
      },
    }),
  },
};

export const BusyActions: Story = {
  parameters: { busy: true, occurrence: createStoryOccurrence() },
};
