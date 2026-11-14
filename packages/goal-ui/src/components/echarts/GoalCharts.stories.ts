import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type {
  GoalClientDTO,
  GoalRecordClientDTO,
  KeyResultClientDTO,
} from '@memoflow/goal-contracts';
import KrCompletionChart from './KrCompletionChart.vue';
import KrWeightDistributionChart from './KrWeightDistributionChart.vue';
import PeriodBarChart from './PeriodBarChart.vue';
import WeightTrendChart from '../weight-snapshot/WeightTrendChart.vue';

const now = Date.now();

const keyResults = [
  {
    id: 'kr-1',
    title: '完成 24 次力量训练',
    description: null,
    progress: {
      aggregationMethod: 'Sum',
      initialValue: 0,
      targetValue: 24,
      currentValue: 24,
      unit: '次',
    },
    target: null,
    progressPercentage: 100,
    isCompleted: true,
    weight: 5,
    order: 0,
    createdAt: now - 30 * 86_400_000,
    updatedAt: now,
  },
  {
    id: 'kr-2',
    title: '每周阅读 3 小时',
    description: null,
    progress: {
      aggregationMethod: 'Sum',
      initialValue: 0,
      targetValue: 150,
      currentValue: 96,
      unit: '小时',
    },
    target: null,
    progressPercentage: 64,
    isCompleted: false,
    weight: 3,
    order: 1,
    createdAt: now - 30 * 86_400_000,
    updatedAt: now,
  },
  {
    id: 'kr-3',
    title: '完成架构评审',
    description: null,
    progress: {
      aggregationMethod: 'Sum',
      initialValue: 0,
      targetValue: 4,
      currentValue: 2,
      unit: '次',
    },
    target: null,
    progressPercentage: 50,
    isCompleted: false,
    weight: 4,
    order: 2,
    createdAt: now - 30 * 86_400_000,
    updatedAt: now,
  },
  {
    id: 'kr-4',
    title: '发布两篇技术文章',
    description: null,
    progress: {
      aggregationMethod: 'Sum',
      initialValue: 0,
      targetValue: 2,
      currentValue: 0,
      unit: '篇',
    },
    target: null,
    progressPercentage: 0,
    isCompleted: false,
    weight: 2,
    order: 3,
    createdAt: now - 30 * 86_400_000,
    updatedAt: now,
  },
] as unknown as KeyResultClientDTO[];

const goal = {
  id: 'goal-1',
  identityId: 'identity-1',
  name: '技术能力提升',
  summary: '全年聚焦架构设计与工程效率。',
  description: null,
  status: 'InProgress',
  start: { kind: 'year', year: 2026 },
  target: { kind: 'year', year: 2026 },
  completedAt: null,
  archivedAt: null,
  sortOrder: 0,
  reminderConfig: null,
  labels: [],
  createdAt: now - 120 * 86_400_000,
  updatedAt: now,
  deletedAt: null,
  version: 3,
  keyResults,
  reviews: null,
  totalKeyResults: keyResults.length,
  completedKeyResults: 1,
  overallProgress: 64,
} as unknown as GoalClientDTO;

const dayMs = 86_400_000;
const records = [
  { dayOffset: 0, hour: 7 },
  { dayOffset: 0, hour: 9 },
  { dayOffset: 1, hour: 8 },
  { dayOffset: 1, hour: 14 },
  { dayOffset: 2, hour: 13 },
  { dayOffset: 2, hour: 19 },
  { dayOffset: 3, hour: 20 },
  { dayOffset: 3, hour: 23 },
  { dayOffset: 4, hour: 6 },
  { dayOffset: 4, hour: 22 },
].map(({ dayOffset, hour }, index) => {
  const date = new Date(now - dayOffset * dayMs);
  date.setHours(hour, index % 2 === 0 ? 15 : 45, 0, 0);
  return {
    id: `record-${index}`,
    keyResultId: 'kr-1',
    goalId: 'goal-1',
    value: 1,
    valueAfter: index + 1,
    authorship: 'Manual',
    source: null,
    recordedAt: date.getTime(),
    comment: null,
    createdAt: date.getTime(),
    updatedAt: date.getTime(),
  } as unknown as GoalRecordClientDTO;
});

const goalWithRecords = { ...goal, records } as GoalClientDTO & {
  records: GoalRecordClientDTO[];
};

const meta = {
  title: 'Business/Goal/Charts',
  component: KrCompletionChart,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    goal: { description: '目标 DTO；图表数据由关键结果与记录派生' },
  },
} satisfies Meta<typeof KrCompletionChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const KrCompletion: Story = {
  args: { goal },
};

export const KrWeightDistribution: Story = {
  args: { goal },
  render: (args) => ({
    components: { KrWeightDistributionChart },
    setup: () => ({ args }),
    template: '<KrWeightDistributionChart v-bind="args" />',
  }),
};

export const PeriodBar: Story = {
  args: { goal: goalWithRecords as unknown as GoalClientDTO },
  render: (args) => ({
    components: { PeriodBarChart },
    setup: () => ({ args }),
    template: '<PeriodBarChart v-bind="args" />',
  }),
};

/**
 * WeightTrendChart currently reads `useWeightSnapshot`, whose fetch stub never
 * produces trend data; the reachable state is the empty alert. The story keeps
 * that state visible so the gap stays reviewable.
 */
export const WeightTrend: Story = {
  args: { goal },
  render: () => ({
    components: { WeightTrendChart },
    template: '<WeightTrendChart goal-id="goal-1" />',
  }),
};

const themeComparisonTemplate = `
  <div class="grid gap-6 md:grid-cols-2">
    <section class="rounded-xl border border-border bg-background p-4 text-foreground">
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Light · brand gold</p>
      <div class="chart-stack">
        <KrCompletionChart :goal="goal" />
        <KrWeightDistributionChart :goal="goal" />
        <PeriodBarChart :goal="periodGoal" />
      </div>
    </section>
    <section class="dark rounded-xl border border-border bg-background p-4 text-foreground">
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dark · brand gold</p>
      <div class="chart-stack">
        <KrCompletionChart :goal="goal" />
        <KrWeightDistributionChart :goal="goal" />
        <PeriodBarChart :goal="periodGoal" />
      </div>
    </section>
  </div>
`;

/** Same data, two theme scopes: chart colors follow the token layer. */
export const ThemeComparison: Story = {
  args: { goal },
  render: () => ({
    components: { KrCompletionChart, KrWeightDistributionChart, PeriodBarChart },
    setup: () => ({ goal, periodGoal: goalWithRecords }),
    template: themeComparisonTemplate,
  }),
};
