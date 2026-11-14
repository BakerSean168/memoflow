import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { ChatItem } from '../composables/types';
import AIActivityTimeline from './AIActivityTimeline.vue';

const base: ChatItem = {
  id: 'assistant-1',
  role: 'assistant',
  content: '',
  status: 'generating',
  activityUpdatedAt: Date.now(),
};

const meta = {
  title: 'Business/AI/AIActivityTimeline',
  component: AIActivityTimeline,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [() => ({ template: '<div style="max-width: 640px;"><story /></div>' })],
  args: { item: base },
} satisfies Meta<typeof AIActivityTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Processing: Story = {};

export const RunningTools: Story = {
  args: {
    item: {
      ...base,
      nativeActivities: [
        { toolCallId: 'tool-1', label: 'commandExecution', state: 'running' },
        { toolCallId: 'tool-2', label: 'search', state: 'running' },
      ],
    },
  },
};

export const FailedTool: Story = {
  args: {
    item: {
      ...base,
      nativeActivities: [
        { toolCallId: 'tool-1', label: 'commandExecution', state: 'completed' },
        { toolCallId: 'tool-2', label: 'search', state: 'failed' },
      ],
    },
  },
};

export const WaitingForInput: Story = {
  args: {
    item: {
      ...base,
      askUserRequests: [
        {
          toolCallId: 'question-1',
          question: 'Which workspace should I update?',
          conversationId: 'conversation-1',
          runId: 'run-1',
          status: 'pending',
        },
      ],
    },
  },
};

export const Completed: Story = {
  args: {
    item: {
      ...base,
      status: 'success',
      content: 'The plan was updated.',
      nativeActivities: [{ toolCallId: 'tool-1', label: 'commandExecution', state: 'completed' }],
    },
  },
};

export const Interrupted: Story = {
  args: {
    item: { ...base, status: 'interrupted', content: 'Run stopped by the user.' },
  },
};
