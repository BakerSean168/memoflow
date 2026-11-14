import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { ChatItem } from '../composables/types';
import AIMessagePanel from './AIMessagePanel.vue';

const conversation: ChatItem[] = [
  {
    id: 'user-1',
    role: 'user',
    content: 'Can you turn my design review notes into a short task list?',
    status: 'success',
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    content:
      'Here is a focused task list from the review:\n\n1. Tighten the settings navigation search.\n2. Add a restore action for the active section.\n3. Verify the keyboard shortcuts table.',
    status: 'success',
  },
];

const meta = {
  title: 'Business/AI/AIMessagePanel',
  component: AIMessagePanel,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [() => ({ template: '<div style="height: 620px; display: flex;"><story /></div>' })],
  args: { timeline: conversation, toolMode: 'chat' },
} satisfies Meta<typeof AIMessagePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Conversation: Story = {};

export const Welcome: Story = {
  args: { timeline: [] },
};

export const WelcomeWithoutModels: Story = {
  args: { timeline: [], hasModels: false },
};

export const StreamingWithTools: Story = {
  args: {
    timeline: [
      conversation[0]!,
      {
        id: 'assistant-streaming',
        role: 'assistant',
        content: 'I am checking the workspace before writing the notes.',
        status: 'generating',
        activityUpdatedAt: Date.now(),
        nativeActivities: [
          { toolCallId: 'tool-1', label: 'commandExecution', state: 'running' },
          { toolCallId: 'tool-2', label: 'search', state: 'completed' },
        ],
      },
    ],
  },
};

export const ToolApprovalPending: Story = {
  args: {
    timeline: [
      conversation[0]!,
      {
        id: 'assistant-approval',
        role: 'assistant',
        content: 'I need permission to create the routine.',
        status: 'generating',
        approvals: [
          {
            toolCallId: 'tool-approval-1',
            toolName: 'routine_create',
            category: 'edit',
            risk: 'high',
            conversationId: 'conversation-1',
            runId: 'run-1',
            status: 'pending',
          },
        ],
      },
    ],
  },
};

export const NativePermissionRequest: Story = {
  args: {
    timeline: [
      conversation[0]!,
      {
        id: 'assistant-native-request',
        role: 'assistant',
        content: 'The Agent needs confirmation before editing the task.',
        status: 'generating',
        nativeRequests: [
          {
            request: {
              type: 'permission',
              requestId: 'request-1',
              title: 'Allow Codex to update the selected task?',
              reason: 'The change edits the task title and due date.',
              scope: 'tasks / task-482',
            },
            conversationId: 'conversation-1',
            runId: 'run-1',
            status: 'pending',
          },
        ],
      },
    ],
  },
};

export const SendError: Story = {
  args: {
    timeline: [
      conversation[0]!,
      {
        id: 'assistant-error',
        role: 'assistant',
        content: '',
        status: 'error',
        errorMessage: 'The provider did not respond. Check the connection and retry.',
      },
    ],
  },
};

export const Interrupted: Story = {
  args: {
    timeline: [
      conversation[0]!,
      {
        id: 'assistant-interrupted',
        role: 'assistant',
        content: 'The run was stopped before it finished.',
        status: 'interrupted',
      },
    ],
  },
};
