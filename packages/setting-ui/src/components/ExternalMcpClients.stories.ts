import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { screen, userEvent, waitFor } from 'storybook/test';
import { ResultErrorException } from '@memoflow/transport-contracts/result';
import type {
  LocalGatewayAuditRecord,
  LocalMcpClient,
  LocalMcpClientCredential,
  LocalMcpEndpoint,
} from '@memoflow/ai-contracts';
import { settingUiHost } from '../setting-ui-host';
import ExternalMcpClients from './ExternalMcpClients.vue';

const now = Date.UTC(2026, 10, 24, 9, 30);

const endpoint: LocalMcpEndpoint = {
  url: 'http://127.0.0.1:4123/mcp',
  discoveryPath: '~/.memoflow/profiles/demo/local-mcp.json',
};

const clients: LocalMcpClient[] = [
  {
    id: 'client-codex',
    name: 'Codex CLI',
    writeScopes: ['tasks:write', 'goals:write'],
    tokenPrefix: 'mf_a1b2c3d',
    createdAt: now - 86_400_000,
    revokedAt: null,
  },
  {
    id: 'client-editor',
    name: 'Notes editor',
    writeScopes: [],
    tokenPrefix: 'mf_e4f5g6h',
    createdAt: now - 7_200_000,
    revokedAt: null,
  },
];

const audit: LocalGatewayAuditRecord[] = [
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

/** Demo credential: an obviously unusable token, never a real secret. */
const demoCredential: LocalMcpClientCredential = {
  client: {
    id: 'client-new',
    name: 'New CLI',
    writeScopes: [],
    tokenPrefix: 'mf_demo_00',
    createdAt: now,
    revokedAt: null,
  },
  token: 'mf_demo_00000000000000000000000000000000',
  endpoint,
};

type PortOptions = {
  clients?: LocalMcpClient[];
  audit?: LocalGatewayAuditRecord[];
  endpoint?: LocalMcpEndpoint | null;
  endpointError?: string;
  create?: () => Promise<LocalMcpClientCredential>;
};

function renderSection(options: PortOptions = {}) {
  return {
    components: { ExternalMcpClients },
    setup() {
      provide(
        settingUiHost.AI_LOCAL_AGENT_KEY as symbol,
        {
          getMcpEndpoint: async () => {
            if (options.endpointError) {
              throw new ResultErrorException('private host diagnostics', options.endpointError);
            }
            return options.endpoint === undefined ? endpoint : options.endpoint;
          },
          listMcpClients: async () => options.clients ?? clients,
          listGatewayAudit: async () => options.audit ?? audit,
          createMcpClient: options.create ?? (async () => demoCredential),
          revokeMcpClient: async (id: string) => ({
            ...clients[0]!,
            id,
            revokedAt: now,
          }),
        } as never,
      );
      return {};
    },
    template: '<div style="max-width: 760px"><ExternalMcpClients /></div>',
  };
}

const meta = {
  title: 'Business/Setting/ExternalMcpClients',
  component: ExternalMcpClients,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ExternalMcpClients>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Connected endpoint, two active clients and the recent tool audit. */
export const ConnectedClients: Story = {
  render: () => renderSection(),
};

/** No client has been issued yet: the section keeps the endpoint and an empty list. */
export const NoClients: Story = {
  render: () => renderSection({ clients: [], audit: [] }),
};

/** Loopback endpoint failed to bind; client management stays visible and the error is actionable. */
export const EndpointError: Story = {
  render: () => renderSection({ endpoint: null, endpointError: 'LOCAL_MCP_PORT_IN_USE' }),
};

/** Create form open and waiting for input. */
export const CreateDialog: Story = {
  render: () => renderSection(),
  play: async () => {
    await userEvent.click(await screen.findByTestId('ai-external-mcp-create-open'));
    await screen.findByTestId('ai-external-mcp-create-form');
  },
};

/** Token shown once after creation, with the copy-paste MCP config snippet. */
export const IssuedCredential: Story = {
  render: () =>
    renderSection({
      create: async () => ({ ...demoCredential, client: { ...demoCredential.client } }),
    }),
  play: async () => {
    await userEvent.click(await screen.findByTestId('ai-external-mcp-create-open'));
    await userEvent.type(await screen.findByTestId('ai-external-mcp-name'), 'Demo CLI');
    await waitFor(() => {
      const submit = screen.getByTestId('ai-external-mcp-create') as HTMLButtonElement;
      if (submit.disabled) throw new Error('create still disabled');
    });
    await userEvent.click(screen.getByTestId('ai-external-mcp-create'));
    await screen.findByTestId('ai-external-mcp-credential');
  },
};
