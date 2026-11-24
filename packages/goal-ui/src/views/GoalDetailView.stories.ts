import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { useRouter } from 'vue-router';
import {
  GOAL_KNOWLEDGE_SERVICE_KEY,
  GOAL_SERVICE_KEY,
  LABEL_SERVICE_KEY,
} from '@goal-ui-test-host/di/keys';
import type {
  IGoalKnowledgeService,
  IGoalService,
  ILabelService,
} from '@goal-ui-test-host/di/types';
import GoalDetailView from './GoalDetailView.vue';
import {
  createStoryGoal,
  createStoryGoalWorkspace,
  storyGoalId,
  storyKeyResults,
  storyRecords,
} from '../components/dialogs/goal-story-fixtures';

type DetailStoryParameters = {
  workspace?: ReturnType<typeof createStoryGoalWorkspace>;
  mode?: 'ready' | 'not-found' | 'loading';
};

function installGoalDetailPorts(parameters: DetailStoryParameters) {
  const workspace = parameters.workspace ?? createStoryGoalWorkspace();
  const mode = parameters.mode ?? 'ready';
  provide(GOAL_SERVICE_KEY, {
    // Owner reads only: writes stay unmocked so a stray interaction is visible.
    getGoalWorkspace: async () => {
      if (mode === 'loading') return new Promise(() => {});
      if (mode === 'not-found')
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Story goal is missing' } };
      return { ok: true, data: workspace };
    },
    getGoalAggregateView: async () => ({
      ok: true,
      data: {
        goal: workspace.goal,
        keyResults: workspace.goal.keyResults ?? [],
        records: storyRecords,
        reviews: [],
      },
    }),
    listGoals: async () => ({ ok: true, data: { goals: [workspace.goal], pagination: undefined } }),
  } as unknown as IGoalService);
  provide(LABEL_SERVICE_KEY, {
    listLabels: async () => ({ ok: true, data: [] }),
  } as unknown as ILabelService);
  provide(GOAL_KNOWLEDGE_SERVICE_KEY, {
    listGoalKnowledge: async () => ({ ok: true, data: [] }),
  } as unknown as IGoalKnowledgeService);
}

const meta = {
  title: 'Business/Goal/GoalDetailView',
  component: GoalDetailView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: (_args, { parameters }) => ({
    components: { GoalDetailView },
    setup() {
      installGoalDetailPorts(parameters);
      const router = useRouter();
      router.addRoute({
        path: '/storybook/goal/:id',
        name: 'storybook-goal-detail',
        component: { template: '<div />' },
      });
      void router.push(`/storybook/goal/${storyGoalId}`);
      return {};
    },
    template: `<div style="height: 980px" data-testid="goal-detail-story-surface">
      <GoalDetailView />
    </div>`,
  }),
} satisfies Meta<typeof GoalDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InProgressWithKeyResults: Story = {};

export const CompletedGoal: Story = {
  parameters: {
    workspace: createStoryGoalWorkspace(
      createStoryGoal({
        status: 'Completed',
        completedAt: Date.UTC(2026, 11, 20),
        overallProgress: 100,
        completedKeyResults: storyKeyResults.length,
        keyResults: storyKeyResults.map((keyResult) => ({
          ...keyResult,
          isCompleted: true,
          progressPercentage: 100,
          progress: { ...keyResult.progress, currentValue: keyResult.progress.targetValue },
        })),
      }),
    ),
  },
};

export const NotFound: Story = {
  parameters: { mode: 'not-found' },
};

export const Loading: Story = {
  parameters: { mode: 'loading' },
};
