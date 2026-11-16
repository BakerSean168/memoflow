import { it, expect } from 'vitest';
import { z } from 'zod';
import { LocalAgentToolBridge } from './local-tool-bridge';
import { LocalAgentRepository } from '../infrastructure/adapters/powersync/local-agent.repository';
import { LocalGatewayAuditRepository } from '../infrastructure/adapters/powersync/local-gateway-audit.repository';
import { LocalMcpClientRepository } from '../infrastructure/adapters/powersync/local-mcp-client.repository';
import { createLocalAgentSqlite } from '../../testing/local-agent-sqlite';
import { PermissionLocalRepository } from '../permissions/permission-powersync.repository';

function call(url: string, token: string, name: string) {
  return fetch(url, {
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

it('audits built-in run and external client tool calls through one sink', async () => {
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const clients = new LocalMcpClientRepository(db);
  const audit = new LocalGatewayAuditRepository(db);
  const connection = await store.createConnection('owner', {
    driver: 'codex',
    name: 'Codex',
    executablePath: 'codex',
    enabled: true,
    writeScopes: [],
  });
  const bridge = new LocalAgentToolBridge({
    store,
    permissions: new PermissionLocalRepository(db),
    isActive: () => true,
    clients,
    audit,
    registerTools(server) {
      server.registerTool('owned_read', { inputSchema: z.object({}).strict() }, async () => ({
        content: [{ type: 'text', text: 'ok' }],
      }));
      server.registerTool('task_plan_create', { inputSchema: z.object({}).strict() }, async () => {
        return { isError: true, content: [{ type: 'text', text: 'PERMISSION_DENIED' }] };
      });
    },
  });
  try {
    const grant = await bridge.open({
      identityId: 'owner',
      connectionId: connection.id,
      conversationId: 'chat',
      runId: 'run',
    });
    expect((await call(grant.url, grant.token, 'owned_read')).status).toBe(200);
    expect((await call(grant.url, grant.token, 'task_plan_create')).status).toBe(200);

    const runRows = await bridge.listGatewayAudit('owner');
    expect(runRows.map((row) => row.tool).sort()).toEqual(['owned_read', 'task_plan_create']);
    expect(runRows.find((row) => row.tool === 'task_plan_create')).toMatchObject({
      origin: 'run',
      connectionId: connection.id,
      effect: 'write',
      scopeDecision: 'denied',
      outcome: 'PERMISSION_DENIED',
    });
    expect(runRows.find((row) => row.tool === 'owned_read')).toMatchObject({
      origin: 'run',
      connectionId: connection.id,
      effect: 'read',
      scopeDecision: 'allowed',
      outcome: 'ok',
    });

    const credential = await bridge.createMcpClient('owner', {
      name: 'External',
      writeScopes: [],
    });
    expect((await call(credential.endpoint.url, credential.token, 'owned_read')).status).toBe(200);

    const clientRows = await bridge.listGatewayAudit('owner');
    expect(clientRows).toHaveLength(3);
    expect(clientRows.find((row) => row.origin === 'client')).toMatchObject({
      origin: 'client',
      connectionId: credential.client.id,
      tool: 'owned_read',
      effect: 'read',
      scopeDecision: 'allowed',
    });
    // Another Profile sees none of this Profile's audit trail.
    expect(await bridge.listGatewayAudit('other')).toEqual([]);
  } finally {
    await bridge.dispose();
    db.close();
  }
});
