import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { ChatNativeRequest } from '../composables/types';
import AILocalRequestCard from './AILocalRequestCard.vue';

const permissionRequest: ChatNativeRequest = {
  request: {
    type: 'permission',
    requestId: 'request-permission-1',
    title: 'Allow Codex to update the selected task?',
    reason: 'The requested change edits the task title and due date.',
    scope: 'tasks / task-482',
    operation: 'edit',
  },
  conversationId: 'conversation-1',
  runId: 'run-1',
  status: 'pending',
};

const userInputRequest: ChatNativeRequest = {
  request: {
    type: 'user_input',
    requestId: 'request-input-1',
    questions: [
      {
        id: 'question-1',
        prompt: 'Which workspace should the new note belong to?',
        options: ['Product notes', 'Personal notes'],
      },
    ],
  },
  conversationId: 'conversation-1',
  runId: 'run-1',
  status: 'pending',
};

const meta = {
  title: 'Business/AI/AILocalRequestCard',
  component: AILocalRequestCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [() => ({ template: '<div style="max-width: 620px;"><story /></div>' })],
  args: { request: permissionRequest },
} satisfies Meta<typeof AILocalRequestCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PermissionPending: Story = {};

export const BusinessPermission: Story = {
  args: {
    request: {
      ...permissionRequest,
      request: {
        ...permissionRequest.request,
        business: {
          agentId: 'codex-work',
          agentName: 'Codex · Work',
          object: 'task',
          action: 'update',
          expiresAt: Date.now() + 45_000,
        },
      },
    },
  },
};

export const UserInputPending: Story = {
  args: { request: userInputRequest },
};

export const Expired: Story = {
  args: {
    request: {
      ...permissionRequest,
      status: 'expired',
    },
  },
};
