import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { LocalAgentConnection, LocalAgentStatus } from '@memoflow/ai-contracts';
import LocalAgentSettings from './LocalAgentSettings.vue';

const now = Date.now();

const connection: LocalAgentConnection = {
  id: 'connection-codex-work',
  driver: 'codex',
  instanceSlug: 'codex-work',
  accentColor: '#6469da',
  name: 'Codex · Work',
  executablePath: '/usr/local/bin/codex',
  homePath: '/home/demo/.codex',
  enabled: true,
  writeScopes: ['goals:write', 'tasks:write'],
  nativePermissionMode: 'supervised',
  revision: 4,
  createdAt: now - 86_400_000,
  updatedAt: now - 1_800_000,
};

const readyStatus: LocalAgentStatus = {
  status: 'ready',
  version: '0.4.12',
  account: { type: 'chatgpt', email: 'demo@example.com', planType: 'plus' },
  models: [
    {
      id: 'gpt-5-codex',
      name: 'GPT-5 Codex',
      reasoningEfforts: ['low', 'medium', 'high'],
      defaultReasoningEffort: 'medium',
    },
    { id: 'gpt-5-mini', name: 'GPT-5 mini' },
  ],
};

const identity = {
  name: 'Codex · Work',
  instanceSlug: 'codex-work',
  accentColor: '#6469da',
};

const meta = {
  title: 'Business/Setting/LocalAgentSettings',
  component: LocalAgentSettings,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [() => ({ template: '<div style="max-width: 760px;"><story /></div>' })],
  args: {
    connection,
    identity,
    driver: 'codex',
    enabled: true,
    status: readyStatus,
    canProbe: true,
    isDefault: false,
    revision: 4,
    busy: false,
    error: false,
  },
  argTypes: {
    driver: { control: 'select', options: ['codex', 'claude', 'pi', 'dsh', 'antigravity'] },
  },
} satisfies Meta<typeof LocalAgentSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Disabled: Story = {
  args: { enabled: false },
};

export const CliNotFound: Story = {
  args: {
    status: { status: 'not_installed', message: 'The Codex CLI was not found on PATH.' },
  },
};

export const DefaultDriver: Story = {
  args: { isDefault: true },
};

export const Busy: Story = {
  args: { busy: true },
};

export const SaveError: Story = {
  args: { error: true },
};

export const WithoutConnection: Story = {
  args: {
    connection: null,
    status: undefined,
    driver: 'claude',
    identity: { name: 'Claude Code', instanceSlug: 'claude-work', accentColor: '#d97757' },
  },
};
