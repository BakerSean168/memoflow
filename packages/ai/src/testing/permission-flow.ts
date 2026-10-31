import { request as httpRequest } from 'node:http';
import { z } from 'zod';
import type { BusinessApprovalDecision, LocalAgentRequest } from '@memoflow/ai-contracts';
import { createLocalAgentSqlite } from './local-agent-sqlite';
import { LocalAgentRepository } from '../server/infrastructure/adapters/powersync/local-agent.repository';
import { PermissionLocalRepository } from '../server/permissions/permission-powersync.repository';
import { LocalAgentToolBridge } from '../server/local-agent/local-tool-bridge';

/** Isolated component journey: real MCP checkpoint/storage; no Provider or user profile. */
export async function createPermissionFlowFixture(onRequest: (request: LocalAgentRequest) => void) {
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const repository = new PermissionLocalRepository(db);
  const connection = await store.createConnection('owner', {
    driver: 'codex',
    name: 'Codex',
    executablePath: 'codex',
    enabled: true,
    writeScopes: ['goals:write', 'tasks:write'],
  });
  let respond: ((decision: BusinessApprovalDecision) => void) | undefined;
  let writes = 0;
  const bridge = new LocalAgentToolBridge({
    store,
    permissions: repository,
    isActive: () => true,
    registerTools(server, context) {
      server.registerTool('save', { inputSchema: z.object({}) }, async () => {
        await context.executeAuthorized('goal.create', 'save', async () => {
          writes++;
        });
        return { content: [{ type: 'text', text: 'saved' }] };
      });
    },
  });
  await bridge.permissions('owner', {
    action: 'settings',
    settings: { preset: 'confirm_each', agentPresets: {}, revision: 1 },
  });
  const grant = await bridge.open({
    identityId: 'owner',
    connectionId: connection.id,
    conversationId: 'chat',
    runId: 'run',
    requestApproval: async (_tool, signal, business) =>
      new Promise<BusinessApprovalDecision>((resolve) => {
        respond = resolve;
        signal.addEventListener('abort', () => resolve('decline'), { once: true });
        onRequest({ type: 'permission', requestId: 'request', title: 'MemoFlow: save', business });
      }),
  });
  return {
    get writes() {
      return writes;
    },
    respond(decision: BusinessApprovalDecision) {
      respond?.(decision);
      respond = undefined;
    },
    snapshot: () => bridge.permissions('owner', { action: 'snapshot' }),
    async call() {
      return new Promise<string>((resolve, reject) => {
        const request = httpRequest(
          grant.url,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${grant.token}`,
              accept: 'application/json, text/event-stream',
              'content-type': 'application/json',
            },
          },
          (response) => {
            let text = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
              text += chunk;
            });
            response.on('end', () => resolve(text));
            response.on('error', reject);
          },
        );
        request.on('error', reject);
        request.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: writes + 1,
            method: 'tools/call',
            params: { name: 'save', arguments: {} },
          }),
        );
      });
    },
    async dispose() {
      await bridge.dispose();
      db.close();
    },
  };
}
