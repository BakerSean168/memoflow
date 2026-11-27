import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { screen, userEvent } from 'storybook/test';
import type {
  LocalGatewayAuditRecord,
  LocalMcpClient,
  PermissionSnapshot,
} from '@memoflow/ai-contracts';
import { settingUiHost } from '../setting-ui-host';
import AIActivitySettings from './AIActivitySettings.vue';

const now = Date.UTC(2026, 10, 24, 9, 30);

const clients: LocalMcpClient[] = [
  {
    id: 'client-codex',
    name: 'Codex CLI',
    writeScopes: ['tasks:write'],
    tokenPrefix: 'mf_a1b2c3d',
    createdAt: now - 86_400_000,
    revokedAt: null,
  },
];

const mcpAudit: LocalGatewayAuditRecord[] = [
  {
    id: 'audit-1',
    version: '1',
    at: now - 600_000,
    connectionId: 'client-codex',
    origin: 'client',
    tool: 'tasks.update',
    effect: 'write',
    scopeDecision: 'allowed',
    outcome: 'updated 1 task',
    durationMs: 42,
    requestId: 'req-0001',
    traceId: 'trace-0001',
  },
  {
    id: 'audit-2',
    version: '1',
    at: now - 480_000,
    connectionId: 'client-editor',
    origin: 'client',
    tool: 'goals.delete',
    effect: 'write',
    scopeDecision: 'denied',
    outcome: 'read-only client',
    durationMs: 3,
    requestId: 'req-0002',
    traceId: 'trace-0002',
  },
];

const permissionAudit: PermissionSnapshot['audit'] = [
  {
    id: 'perm-1',
    occurredAt: now - 1_800_000,
    agentId: 'codex',
    conversationId: 'conversation-1',
    operationId: 'op-1001',
    object: 'task',
    action: 'update',
    decision: 'ask',
    decidedBy: 'user',
    ruleId: null,
    risks: ['bulk'],
    execution: 'succeeded',
  },
  {
    id: 'perm-2',
    occurredAt: now - 900_000,
    agentId: 'codex',
    conversationId: null,
    operationId: 'op-1002',
    object: 'goal',
    action: 'delete',
    decision: 'deny',
    decidedBy: 'rule',
    ruleId: 'rule-legacy-denial',
    risks: ['delete_permanent'],
    execution: 'not_started',
  },
];

function renderActivity(
  options: {
    tab?: 'mcp' | 'permissions';
    mcpAudit?: LocalGatewayAuditRecord[];
    permissionAudit?: PermissionSnapshot['audit'];
    mcpError?: boolean;
    unavailable?: boolean;
  } = {},
) {
  return {
    components: { AIActivitySettings },
    setup() {
      if (!options.unavailable) {
        provide(
          settingUiHost.AI_LOCAL_AGENT_KEY as symbol,
          {
            listMcpClients: async () => clients,
            listGatewayAudit: async () => {
              if (options.mcpError) throw new Error('gateway unavailable');
              return options.mcpAudit ?? mcpAudit;
            },
            permissions: async () => ({
              settings: { preset: 'confirm_each', agentPresets: {}, revision: 1 },
              rules: [],
              audit: options.permissionAudit ?? permissionAudit,
            }),
          } as never,
        );
      }
      return { tab: options.tab ?? 'mcp' };
    },
    template: '<div style="max-width: 820px"><AIActivitySettings :tab="tab" /></div>',
  };
}

const meta = {
  title: 'Business/Setting/AIActivitySettings',
  component: AIActivitySettings,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AIActivitySettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const McpToolCalls: Story = {
  render: () => renderActivity({ tab: 'mcp' }),
};

export const PermissionDecisions: Story = {
  render: () => renderActivity({ tab: 'mcp' }),
  play: async () => {
    const tab = await screen.findByTestId('ai-activity-tab-permissions');
    await userEvent.click(tab);
    await screen.findByTestId('ai-permission-activity-list');
  },
};

export const McpErrorIsolated: Story = {
  render: () => renderActivity({ tab: 'mcp', mcpError: true }),
};

export const Empty: Story = {
  render: () => renderActivity({ tab: 'mcp', mcpAudit: [], permissionAudit: [] }),
};

export const Unavailable: Story = {
  render: () => renderActivity({ unavailable: true }),
};
