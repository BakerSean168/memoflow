import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { createMockGoalRecord } from '@memoflow/goal-contracts/test-support/goal.mock';
import type { GoalRecordClientDTO } from '@memoflow/goal-contracts';
import GoalRecordCard from './GoalRecordCard.vue';

function mockRecord(overrides: Partial<GoalRecordClientDTO> = {}): GoalRecordClientDTO {
  return createMockGoalRecord({
    value: 42,
    valueAfter: 58,
    authorship: 'Manual',
    recordedAt: Date.now() - 3_600_000,
    comment: null,
    ...overrides,
  });
}

const meta = {
  title: 'Business/Goal/GoalRecordCard',
  component: GoalRecordCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [() => ({ template: '<div style="max-width: 420px;"><story /></div>' })],
  argTypes: {
    record: { description: '目标记录 DTO（GoalRecordClientDTO）' },
  },
} satisfies Meta<typeof GoalRecordCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    record: mockRecord(),
  },
};

export const WithComment: Story = {
  args: {
    record: mockRecord({
      value: 80,
      comment: '完成本周两次力量训练，下一次尝试增加负重。',
    }),
  },
};

export const AiAuthored: Story = {
  args: {
    record: mockRecord({
      value: 12,
      authorship: 'TaskAutomatic',
      comment: '依据任务完成情况自动写入的进展。',
    }),
  },
};

export const LongComment: Story = {
  args: {
    record: mockRecord({
      value: 5,
      comment:
        '今天完成了计划中的全部练习，但在最后一组动作时状态下滑明显。下一次会把休息时间延长到 90 秒，并把训练拆分到上午和傍晚两段完成，避免后程质量下降。',
    }),
  },
};
