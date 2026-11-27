import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { screen, userEvent } from 'storybook/test';
import type {
  PermissionCommand,
  PermissionSettings,
  PermissionSnapshot,
} from '@memoflow/ai-contracts';
import { settingUiHost } from '../setting-ui-host';
import AIPermissionSettings from './AIPermissionSettings.vue';

const now = Date.UTC(2026, 10, 24, 8, 0);

const rules: PermissionSnapshot['rules'] = [
  {
    id: 'rule-goal-update',
    agentId: null,
    object: 'goal',
    action: 'update',
    effect: 'ask',
    source: 'user',
    createdAt: now - 3_600_000,
  },
  {
    id: 'rule-legacy-denial',
    agentId: 'codex',
    object: 'task',
    action: 'delete',
    effect: 'deny',
    source: 'migration',
    createdAt: now - 86_400_000,
  },
];

const audit: PermissionSnapshot['audit'] = [
  {
    id: 'audit-1',
    occurredAt: now - 1_800_000,
    agentId: 'codex',
    conversationId: 'conversation-1',
    operationId: 'op-1001',
    object: 'task',
    action: 'update',
    decision: 'ask',
    decidedBy: 'user',
    ruleId: 'rule-goal-update',
    execution: 'succeeded',
  },
  {
    id: 'audit-2',
    occurredAt: now - 900_000,
    agentId: 'codex',
    conversationId: null,
    operationId: 'op-1002',
    object: 'task',
    action: 'delete',
    decision: 'deny',
    decidedBy: 'rule',
    ruleId: 'rule-legacy-denial',
    execution: 'not_started',
  },
];

function snapshot(settings: Partial<PermissionSettings> = {}): PermissionSnapshot {
  return {
    settings: {
      preset: 'confirm_each',
      agentPresets: {},
      revision: 3,
      bulkThreshold: 25,
      ...settings,
    },
    rules,
    audit,
  };
}

function renderSection(initial: PermissionSnapshot) {
  return {
    components: { AIPermissionSettings },
    setup() {
      let state = initial;
      provide(
        settingUiHost.AI_LOCAL_AGENT_KEY as symbol,
        {
          permissions: async (command: PermissionCommand) => {
            if (command.action === 'settings') state = { ...state, settings: command.settings };
            if (command.action === 'revoke') {
              state = { ...state, rules: state.rules.filter((rule) => rule.id !== command.ruleId) };
            }
            return structuredClone(state);
          },
        } as never,
      );
      return {};
    },
    template: '<div style="max-width: 880px"><AIPermissionSettings /></div>',
  };
}

const meta = {
  title: 'Business/Setting/AIPermissionSettings',
  component: AIPermissionSettings,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AIPermissionSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default supervision: read is allowed, writes ask, plus an existing legacy rule. */
export const ConfirmEach: Story = {
  render: () => renderSection(snapshot()),
};

/** Read-only preset summarized in one line, with no write permission anywhere. */
export const ReadOnly: Story = {
  render: () => renderSection(snapshot({ preset: 'read_only', bulkThreshold: undefined })),
};

/** Per-object overrides and grants opened for review while keeping high-risk notice visible. */
export const CustomOverrides: Story = {
  render: () =>
    renderSection(
      snapshot({
        preset: 'custom',
        customMatrix: {
          goal: { read: 'allow', create: 'ask', update: 'deny', delete: 'deny' },
          knowledge: { read: 'allow', create: 'allow', update: 'ask', delete: 'ask' },
        },
      }),
    ),
  play: async () => {
    const overrides = await screen.findByTestId('ai-permission-overrides');
    await userEvent.click(overrides.querySelector('summary') as HTMLElement);
    await screen.findByTestId('ai-permission-matrix');
    const grants = screen.getByTestId('ai-permission-grants');
    await userEvent.click(grants.querySelector('summary') as HTMLElement);
  },
};

/** No local agent port: the section explains that permissions are unavailable. */
export const Unavailable: Story = {
  render: () => ({
    components: { AIPermissionSettings },
    template: '<div style="max-width: 880px"><AIPermissionSettings /></div>',
  }),
};
