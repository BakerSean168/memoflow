// @vitest-environment happy-dom
/**
 * Local MCP governance surface at the process boundary (#1076 step 5).
 *
 * Mounts the real settings section against the real host port implementation
 * (LocalAgentToolBridge + Profile repositories). Every assertion reads state
 * back from the host, so a mutation that only updates the screen cannot pass.
 */
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetch as nodeFetch } from 'undici';
import { z } from 'zod';
import {
  LocalAgentRepository,
  LocalAgentToolBridge,
  LocalGatewayAuditRepository,
  LocalMcpClientRepository,
  PermissionLocalRepository,
} from '@memoflow/ai';
import { LocalAgentWriteScopeSchema, type LocalMcpClientCredential } from '@memoflow/ai-contracts';
import { ExternalMcpClients } from '@memoflow/setting-ui';
import {
  bindSettingUiHost,
  type SettingLocalAgentPort,
  type SettingUiHost,
} from '@memoflow/setting-ui/host';
import { createRendererSqliteFixture } from '../../../test-support/local-agent-sqlite';
import { productionLocaleMessages } from '@setting-ui-test-host/locales/production-messages';

const confirmMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@memoflow/ui-vue-shadcn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memoflow/ui-vue-shadcn')>()),
  useConfirm: confirmMock,
}));

const owner = 'IdentityId_00000000-0000-4000-8000-000000000107';
const localAgentKey = Symbol('local-agent-port');

const SettingsDialogShell = defineComponent({
  props: {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    testId: { type: String, default: '' },
  },
  setup(props, { slots }) {
    return () =>
      h('section', { 'data-testid': props.testId }, [
        h('h2', props.title),
        h('p', props.description),
        slots.default?.(),
        h('footer', slots.footer?.()),
      ]);
  },
});

function element(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

async function settle(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
}

function toolCall(url: string, token: string, name: string) {
  return nodeFetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: {} },
    }),
  });
}

describe('Local MCP governance settings (#1076 step 5)', () => {
  let fixture: ReturnType<typeof createRendererSqliteFixture>;
  let bridge: LocalAgentToolBridge;
  let clients: LocalMcpClientRepository;
  let lastCredential: LocalMcpClientCredential | null;
  let wrapper: VueWrapper | null;
  let port: SettingLocalAgentPort;

  beforeEach(() => {
    confirmMock.mockReset();
    confirmMock.mockResolvedValue(true);
    fixture = createRendererSqliteFixture();
    clients = new LocalMcpClientRepository(fixture.db);
    const audit = new LocalGatewayAuditRepository(fixture.db);
    bridge = new LocalAgentToolBridge({
      store: new LocalAgentRepository(fixture.db),
      permissions: new PermissionLocalRepository(fixture.db),
      isActive: () => true,
      clients,
      audit,
      registerTools(server) {
        server.registerTool('owned_read', { inputSchema: z.object({}).strict() }, async () => ({
          content: [{ type: 'text', text: 'ok' }],
        }));
      },
    });
    lastCredential = null;
    wrapper = null;
    port = {
      getMcpEndpoint: () => bridge.endpoint(),
      listMcpClients: () => bridge.listMcpClients(owner),
      createMcpClient: async (input) => {
        lastCredential = await bridge.createMcpClient(owner, input);
        return lastCredential;
      },
      revokeMcpClient: (id) => bridge.revokeMcpClient(owner, id),
      listGatewayAudit: (limit) => bridge.listGatewayAudit(owner, limit),
    } as unknown as SettingLocalAgentPort;
    bindSettingUiHost({
      components: { SettingsDialogShell },
      AI_LOCAL_AGENT_KEY: localAgentKey,
    } as unknown as SettingUiHost);
  });

  afterEach(async () => {
    wrapper?.unmount();
    await bridge.dispose();
    fixture.close();
  });

  async function mountSection(): Promise<void> {
    wrapper = mount(ExternalMcpClients, {
      attachTo: document.body,
      global: {
        plugins: [
          createI18n({
            legacy: false,
            locale: 'en-US',
            messages: productionLocaleMessages,
          }),
        ],
        provide: { [localAgentKey as symbol]: port },
      },
    });
    await settle();
  }

  it('persists a client created in Settings and keeps the one-time token', async () => {
    await mountSection();
    expect(element('ai-external-mcp-endpoint')).not.toBeNull();

    element('ai-external-mcp-create-open')!.click();
    await settle();
    const name = element('ai-external-mcp-name') as HTMLInputElement;
    name.value = 'Codex CLI';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    for (const scope of LocalAgentWriteScopeSchema.options) {
      element(`ai-external-mcp-scope-${scope}`)!.click();
    }
    await settle();
    element('ai-external-mcp-create-form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await settle();

    const saved = await clients.list(owner);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      name: 'Codex CLI',
      writeScopes: [...LocalAgentWriteScopeSchema.options],
      revokedAt: null,
    });
    expect(lastCredential).not.toBeNull();
    expect(saved[0]!.tokenPrefix).toBe(lastCredential!.token.slice(0, 8));
    expect(element('ai-external-mcp-credential')?.textContent).toContain(lastCredential!.token);
  });

  it('revokes through the confirm dialog, persists it and rejects the old token', async () => {
    const credential = await bridge.createMcpClient(owner, {
      name: 'Codex CLI',
      writeScopes: [],
    });
    await mountSection();
    expect(element(`ai-external-mcp-client-${credential.client.id}`)).not.toBeNull();

    element(`ai-external-mcp-revoke-${credential.client.id}`)!.click();
    await settle();

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Revoke Codex CLI?', variant: 'destructive' }),
    );
    const saved = await clients.list(owner);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.revokedAt).not.toBeNull();
    expect(element(`ai-external-mcp-client-${credential.client.id}`)).toBeNull();
    expect(element(`ai-external-mcp-revoked-client-${credential.client.id}`)).not.toBeNull();

    expect((await toolCall(credential.endpoint.url, credential.token, 'owned_read')).status).toBe(
      401,
    );
  });

  it('reads audit rows recorded by the host for the external client', async () => {
    const credential = await bridge.createMcpClient(owner, {
      name: 'Audit CLI',
      writeScopes: [],
    });
    expect((await toolCall(credential.endpoint.url, credential.token, 'owned_read')).status).toBe(
      200,
    );

    await mountSection();

    const audit = element('ai-external-mcp-audit');
    expect(audit).not.toBeNull();
    expect(audit!.textContent).toContain('owned_read');
    expect(audit!.textContent).toContain('Audit CLI');
    expect(audit!.textContent).toContain('Read');
  });
});
