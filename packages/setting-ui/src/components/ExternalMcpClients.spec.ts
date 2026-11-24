import { nextTick } from 'vue';
import { ResultErrorException } from '@memoflow/transport-contracts/result';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LocalGatewayAuditRecord,
  LocalMcpClient,
  LocalMcpClientCredential,
} from '@memoflow/ai-contracts';
import { productionLocaleMessages } from '@setting-ui-test-host/locales/production-messages';
import { settingUiHost } from '../setting-ui-host';

const confirmMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@memoflow/ui-vue-shadcn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memoflow/ui-vue-shadcn')>()),
  useConfirm: confirmMock,
}));

import ExternalMcpClients from './ExternalMcpClients.vue';

const existingClient: LocalMcpClient = {
  id: 'existing-1',
  name: 'Existing CLI',
  writeScopes: [],
  tokenPrefix: 'mf_existing',
  createdAt: 1,
  revokedAt: null,
};

const createdCredential: LocalMcpClientCredential = {
  client: {
    id: 'created-1',
    name: 'Codex CLI',
    writeScopes: [],
    tokenPrefix: 'mf_created',
    createdAt: 2,
    revokedAt: null,
  },
  token: 'mf_token_0123456789abcdef0123456789abcdef',
  endpoint: { url: 'http://127.0.0.1:4123/mcp', discoveryPath: null },
};

const revokedClient: LocalMcpClient = {
  ...existingClient,
  id: 'revoked-1',
  name: 'Old CLI',
  revokedAt: 42,
};

const auditEntry: LocalGatewayAuditRecord = {
  id: 'audit-1',
  version: '1',
  at: 3,
  connectionId: 'revoked-1',
  origin: 'client',
  tool: 'goal_search',
  effect: 'read',
  scopeDecision: 'allowed',
  outcome: 'ok',
  durationMs: 12,
  requestId: 'request-1',
  traceId: 'trace-1',
};

const writeText = vi.fn(async () => {});

function element(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

const cleanups: Array<() => void> = [];
beforeEach(() => {
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  await nextTick();
}

interface MountOptions {
  endpointError?: string;
  clients?: LocalMcpClient[];
  audit?: LocalGatewayAuditRecord[];
  listClients?: () => Promise<LocalMcpClient[]>;
}

function mountSection(options: MountOptions = {}) {
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const list = vi.fn(
    options.listClients ??
      (async () => options.clients ?? [existingClient, createdCredential.client]),
  );
  const port = {
    getMcpEndpoint: vi.fn(async () => {
      if (options.endpointError)
        throw new ResultErrorException('private host diagnostics', options.endpointError);
      return createdCredential.endpoint;
    }),
    listMcpClients: list,
    listGatewayAudit: vi.fn(async () => options.audit ?? []),
    createMcpClient: vi.fn(async () => createdCredential),
    revokeMcpClient: vi.fn(async (id: string) => ({ ...existingClient, id, revokedAt: 7 })),
  };
  const wrapper = mount(ExternalMcpClients, {
    attachTo: document.body,
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en-US',
          messages: productionLocaleMessages,
        }),
      ],
      provide: { [settingUiHost.AI_LOCAL_AGENT_KEY as symbol]: port },
    },
  });
  cleanups.push(() => wrapper.unmount());
  return { wrapper, port };
}

async function openCreatedCredential() {
  const mounted = mountSection();
  await settle();
  element('ai-external-mcp-create-open')!.click();
  await settle();
  const input = element('ai-external-mcp-name') as HTMLInputElement;
  input.value = 'Codex CLI';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  element('ai-external-mcp-create-form')!.dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }),
  );
  await settle();
  return mounted;
}

describe('ExternalMcpClients', () => {
  it.each([
    ['LOCAL_MCP_PORT_IN_USE', 'port is in use'],
    ['LOCAL_MCP_BINDING_INVALID', 'invalid or unreadable'],
  ])(
    'shows an actionable %s error, retains client management, and retries the saved endpoint',
    async (code, message) => {
      const { wrapper, port } = mountSection({ endpointError: code });
      await settle();
      expect(element('ai-external-mcp-error')?.textContent).toContain(message);
      expect(wrapper.text()).toContain('Existing CLI');
      expect(wrapper.text()).not.toContain('private host diagnostics');
      expect((element('ai-external-mcp-create-open') as HTMLButtonElement).disabled).toBe(true);
      port.getMcpEndpoint.mockResolvedValue(createdCredential.endpoint);
      element('ai-external-mcp-retry')!.click();
      await settle();
      expect(element('ai-external-mcp-endpoint')?.textContent).toBe(createdCredential.endpoint.url);
      expect(element('ai-external-mcp-error')).toBeNull();
      expect((element('ai-external-mcp-create-open') as HTMLButtonElement).disabled).toBe(false);
    },
  );

  it('keeps the creation form out of the resting section', async () => {
    const { wrapper } = mountSection();
    await settle();

    expect(element('ai-external-mcp-create-open')).not.toBeNull();
    expect(element('ai-external-mcp-create-form')).toBeNull();
    expect(element('ai-external-mcp-create')).toBeNull();
    expect(element('ai-external-mcp-credential')).toBeNull();
    expect(wrapper.text()).toContain('Existing CLI');
  });

  it('creates through the dialog, shows the one-time token there and pins the new client', async () => {
    const { port } = await openCreatedCredential();

    expect(port.createMcpClient).toHaveBeenCalledWith({
      name: 'Codex CLI',
      writeScopes: [],
    });
    expect(element('ai-external-mcp-create-form')).toBeNull();
    const credential = element('ai-external-mcp-credential')!;
    expect(credential.textContent).toContain(createdCredential.token);
    expect(credential.textContent).toContain('shown once');
    expect(element('ai-external-mcp-create-dialog')!.textContent).toContain('Client created');

    const rows = document.querySelectorAll('[data-testid^="ai-external-mcp-client-"]');
    expect(rows[0]?.getAttribute('data-testid')).toBe('ai-external-mcp-client-created-1');

    element('ai-external-mcp-create-done')!.click();
    await settle();

    expect(element('ai-external-mcp-create-dialog')).toBeNull();
    expect(element('ai-external-mcp-credential')).toBeNull();
    expect(document.body.textContent).not.toContain(createdCredential.token);
  });

  it('offers Routine write scope explicitly when creating a local MCP client', async () => {
    const { port } = mountSection();
    await settle();
    element('ai-external-mcp-create-open')!.click();
    await settle();
    const routine = element('ai-external-mcp-scope-routines:write');
    expect(routine).not.toBeNull();
    routine!.click();
    await settle();
    const name = element('ai-external-mcp-name') as HTMLInputElement;
    name.value = 'Routine Agent';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    element('ai-external-mcp-create-form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await settle();
    expect(port.createMcpClient).toHaveBeenCalledWith({
      name: 'Routine Agent',
      writeScopes: ['routines:write'],
    });
  });

  it('shows loading instead of the empty state until the client list settles', async () => {
    let resolveList!: (clients: LocalMcpClient[]) => void;
    const pending = new Promise<LocalMcpClient[]>((resolve) => {
      resolveList = resolve;
    });
    mountSection({ listClients: () => pending });
    await settle();

    expect(element('ai-external-mcp-loading')).not.toBeNull();
    expect(element('ai-external-mcp-empty')).toBeNull();
    expect(element('ai-external-mcp-client-existing-1')).toBeNull();

    resolveList([existingClient]);
    await settle();

    expect(element('ai-external-mcp-loading')).toBeNull();
    expect(element('ai-external-mcp-client-existing-1')).not.toBeNull();
  });

  it('asks for confirmation and moves a revoked client into the revoked list', async () => {
    let clients = [existingClient, createdCredential.client];
    const { port } = mountSection({ listClients: async () => clients });
    port.revokeMcpClient.mockImplementation(async (id: string) => {
      clients = clients.map((client) => (client.id === id ? { ...client, revokedAt: 9 } : client));
      return clients.find((client) => client.id === id)!;
    });
    await settle();

    element('ai-external-mcp-revoke-existing-1')!.click();
    await settle();

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Revoke Existing CLI?',
        variant: 'destructive',
      }),
    );
    expect(port.revokeMcpClient).toHaveBeenCalledWith('existing-1');
    expect(element('ai-external-mcp-client-existing-1')).toBeNull();
    expect(element('ai-external-mcp-revoked-client-existing-1')).not.toBeNull();
    expect(element('ai-external-mcp-revoked')?.textContent).toContain('Revoked clients');
  });

  it('keeps the client active when revocation is cancelled', async () => {
    confirmMock.mockResolvedValueOnce(false);
    const { port } = mountSection();
    await settle();

    element('ai-external-mcp-revoke-existing-1')!.click();
    await settle();

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(port.revokeMcpClient).not.toHaveBeenCalled();
    expect(element('ai-external-mcp-client-existing-1')).not.toBeNull();
    expect(element('ai-external-mcp-revoked')).toBeNull();
  });

  it('lists revoked clients and resolves their audit origin and effect', async () => {
    const { wrapper } = mountSection({
      clients: [existingClient, revokedClient],
      audit: [auditEntry],
    });
    await settle();

    expect(element('ai-external-mcp-revoked-client-revoked-1')).not.toBeNull();
    expect(wrapper.text()).toContain('Old CLI');
    const audit = element('ai-external-mcp-audit')!;
    expect(audit.textContent).toContain('goal_search');
    expect(audit.textContent).toContain('Old CLI');
    expect(element('ai-external-mcp-audit-effect-audit-1')?.textContent).toContain('Read');
  });

  it('scopes copy feedback to one control and clears it after two seconds', async () => {
    await openCreatedCredential();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const tokenButton = () => element('ai-external-mcp-copy-token')!;
    const snippetButton = () => element('ai-external-mcp-copy-snippet')!;

    tokenButton().click();
    await settle();
    expect(tokenButton().textContent?.trim()).toBe('Copied');
    expect(snippetButton().textContent?.trim()).toBe('Copy');

    snippetButton().click();
    await settle();
    expect(snippetButton().textContent?.trim()).toBe('Copied');
    expect(tokenButton().textContent?.trim()).toBe('Copy');

    vi.advanceTimersByTime(2000);
    await settle();
    expect(tokenButton().textContent?.trim()).toBe('Copy');
    expect(snippetButton().textContent?.trim()).toBe('Copy');
    expect(writeText).toHaveBeenCalledTimes(2);
  });
});
