import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalAgentSqlite } from './local-agent-sqlite';
import { LocalAgentRepository } from '../server/infrastructure/adapters/powersync/local-agent.repository';
import { LocalAgentRuntime } from '../server/local-agent/local-agent-runtime';
import { PiDriver } from '../server/local-agent/pi-driver';
import { NativeRpcTransport } from '../server/local-agent/native-rpc-transport';
import type { AIChatPermissionMode } from '@memoflow/ai-contracts';

export async function createRuntimePermissionAcceptance(nativePeerPath: string) {
  const home = await mkdtemp(join(tmpdir(), 'memoflow-861-'));
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const connection = await store.createConnection('acceptance', {
    driver: 'pi',
    name: 'Isolated native protocol peer',
    executablePath: 'pi',
    homePath: home,
    enabled: true,
    writeScopes: [],
    nativePermissionMode: 'auto-approve',
  });
  const conversation = await store.createConversation('acceptance', {
    connectionId: connection.id,
    modelId: 'fixture/model',
    name: 'Runtime permission acceptance',
  });
  const runtime = new LocalAgentRuntime({
    store,
    cwd: home,
    createDriver: (config, cwd) =>
      new PiDriver(
        config,
        cwd,
        (options) =>
          new NativeRpcTransport({
            ...options,
            executable: process.execPath,
            args: [nativePeerPath, options.args[options.args.indexOf('--extension') + 1]],
          }),
      ),
  });
  const events: unknown[] = [];
  let running = false;
  let failure: string | null = null;
  let run: Promise<void> | undefined;
  return {
    state: () => ({
      conversationId: conversation.id,
      connectionId: connection.id,
      events,
      running,
      failure,
    }),
    start(mode: AIChatPermissionMode) {
      if (running) throw new Error('busy');
      running = true;
      failure = null;
      events.splice(0);
      run = (async () => {
        try {
          for await (const event of runtime.dispatchMessage({
            identityId: 'acceptance',
            conversationId: conversation.id,
            content: 'Run the bounded verification command',
            permissionMode: mode,
          }))
            events.push(event);
        } catch (error) {
          failure = String(error);
        } finally {
          running = false;
        }
      })();
    },
    async approve(requestId: string, runId: string) {
      runtime.respond('acceptance', {
        conversationId: conversation.id,
        runId,
        requestId,
        response: { type: 'permission', decision: 'approve_once' },
      });
    },
    async close() {
      await runtime.dispose();
      await run;
      db.close();
      await rm(home, { recursive: true, force: true });
    },
  };
}
