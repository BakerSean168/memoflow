import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { createMockGoal } from '@memoflow/goal-contracts/test-support/goal.mock';
import type { GoalClientDTO, KeyResultClientDTO } from '@memoflow/goal-contracts';
import GoalTimelineView from './GoalTimelineView.vue';

const keyResults = [
  {
    id: 'kr-1',
    title: '完成 24 次力量训练',
    description: '以训练日志为准。',
    progress: {
      aggregationMethod: 'Sum',
      initialValue: 0,
      targetValue: 24,
      currentValue: 16,
      unit: '次',
    },
    target: { kind: 'year', year: 2026 },
    progressPercentage: 67,
    isCompleted: false,
    weight: 5,
    order: 0,
    createdAt: Date.now() - 30 * 86_400_000,
    updatedAt: Date.now(),
  },
  {
    id: 'kr-2',
    title: '每周阅读 3 小时',
    description: null,
    progress: {
      aggregationMethod: 'Sum',
      initialValue: 0,
      targetValue: 150,
      currentValue: 118,
      unit: '小时',
    },
    target: { kind: 'year', year: 2026 },
    progressPercentage: 79,
    isCompleted: false,
    weight: 3,
    order: 1,
    createdAt: Date.now() - 30 * 86_400_000,
    updatedAt: Date.now(),
  },
  {
    id: 'kr-3',
    title: '完成架构评审',
    description: null,
    progress: {
      aggregationMethod: 'Sum',
      initialValue: 0,
      targetValue: 1,
      currentValue: 1,
      unit: null,
    },
    target: { kind: 'year', year: 2026 },
    progressPercentage: 100,
    isCompleted: true,
    weight: 2,
    order: 2,
    createdAt: Date.now() - 30 * 86_400_000,
    updatedAt: Date.now(),
  },
] as unknown as KeyResultClientDTO[];

function mockGoal(overrides: Partial<GoalClientDTO> = {}): GoalClientDTO {
  return createMockGoal({
    name: '技术能力提升',
    summary: '全年聚焦架构设计与工程效率。',
    status: 'InProgress',
    start: { kind: 'year', year: 2026 },
    target: { kind: 'year', year: 2026 },
    keyResults,
    totalKeyResults: keyResults.length,
    completedKeyResults: 1,
    overallProgress: 76,
    createdAt: Date.now() - 120 * 86_400_000,
    updatedAt: Date.now(),
    ...overrides,
  });
}

const meta = {
  title: 'Business/Goal/GoalTimelineView',
  component: GoalTimelineView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    goal: { description: '目标 DTO（GoalClientDTO），时间线由关键结果派生' },
  },
} satisfies Meta<typeof GoalTimelineView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    goal: mockGoal(),
  },
};

export const SingleKeyResult: Story = {
  args: {
    goal: mockGoal({ keyResults: [keyResults[0]!], totalKeyResults: 1 }),
  },
};

export const Empty: Story = {
  args: {
    goal: mockGoal({ keyResults: null, totalKeyResults: 0, overallProgress: 0 }),
  },
};
