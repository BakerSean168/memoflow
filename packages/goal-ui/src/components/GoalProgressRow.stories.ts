import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { createMockGoal } from '@memoflow/goal-contracts/test-support/goal.mock';
import type { GoalClientDTO } from '@memoflow/goal-contracts';
import GoalProgressRow from './GoalProgressRow.vue';

const now = Date.now();

function mockGoal(overrides: Partial<GoalClientDTO> = {}): GoalClientDTO {
  return createMockGoal({
    name: '技术能力提升',
    summary: '全年聚焦架构设计与工程效率，按季度复盘。',
    status: 'InProgress',
    start: { kind: 'year', year: 2026 },
    target: { kind: 'year', year: 2026 },
    completedAt: null,
    labels: [],
    keyResults: null,
    totalKeyResults: 4,
    completedKeyResults: 2,
    overallProgress: 62,
    createdAt: now - 90 * 86_400_000,
    updatedAt: now,
    ...overrides,
  });
}

const labels = [
  {
    id: 'label-growth',
    identityId: 'identity-1',
    name: '成长',
    normalizedName: '成长',
    color: '#4f8bff',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'label-focus',
    identityId: 'identity-1',
    name: '重点',
    normalizedName: '重点',
    color: '#f59e0b',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'label-hidden',
    identityId: 'identity-1',
    name: '长期',
    normalizedName: '长期',
    color: null,
    createdAt: now,
    updatedAt: now,
  },
] as unknown as GoalClientDTO['labels'];

const meta = {
  title: 'Business/Goal/GoalProgressRow',
  component: GoalProgressRow,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    () => ({
      template:
        '<div class="@container/panel" style="max-width: 960px; border: 1px solid hsl(var(--border)); border-radius: 0.5rem;"><story /></div>',
    }),
  ],
  argTypes: {
    goal: { description: '目标 DTO（GoalClientDTO）' },
  },
} satisfies Meta<typeof GoalProgressRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    goal: mockGoal(),
  },
};

export const WithLabels: Story = {
  args: {
    goal: mockGoal({ labels, summary: '标签展示与截断行为。' }),
  },
};

export const Completed: Story = {
  args: {
    goal: mockGoal({
      name: '完成年度读书计划',
      status: 'Completed',
      completedAt: now - 5 * 86_400_000,
      completedKeyResults: 4,
      totalKeyResults: 4,
      overallProgress: 100,
    }),
  },
};

export const PastTarget: Story = {
  args: {
    goal: mockGoal({
      name: 'Q3 性能优化',
      target: { kind: 'day', date: '2026-09-30' } as unknown as GoalClientDTO['target'],
      overallProgress: 41,
    }),
  },
};

export const Compact: Story = {
  args: {
    goal: mockGoal({ summary: '窄容器下走紧凑布局。' }),
  },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  decorators: [
    () => ({
      template:
        '<div class="@container/panel" style="max-width: 360px; border: 1px solid hsl(var(--border)); border-radius: 0.5rem;"><story /></div>',
    }),
  ],
};

export const LongTitle: Story = {
  args: {
    goal: mockGoal({
      name: '构建端到端可观测性体系并完成全链路追踪改造与告警收敛工作',
      summary: '覆盖 Web、Desktop 与 API 三个交付面；统一指标口径，替换历史看板并补齐全链路采样。',
    }),
  },
};
