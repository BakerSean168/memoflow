import { join } from 'node:path';
import { ok } from '@memoflow/contracts/result';
import { AIChannels, AIStreamChannels } from '@memoflow/contracts/electron';
import {
  LocalAgentClientCommandSchema,
  AgentRegistryCommandSchema,
  AssistantRuntimeClientCommandSchema,
} from '@memoflow/contracts/ai';
import { createLocalAgentIpcClient } from '../client/local-agent';
import { createAgentRegistryIpcClient } from '../client/agent-instance';
import { createAssistantRuntimeIpcClient } from '../client/runtime-assistant';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { createLocalAgentSqlite } from './local-agent-sqlite';
import { AgentInstanceRegistry } from '../server/application/agent-instance/agent-instance.registry';
import { AgentInstancePowerSyncRepository } from '../server/infrastructure/adapters/powersync/agent-instance.repository';
import { LocalAgentRepository } from '../server/infrastructure/adapters/powersync/local-agent.repository';
import { LocalAgentRuntime } from '../server/local-agent/local-agent-runtime';
import { CodexDriver } from '../server/local-agent/codex-driver';
import { NativeRpcTransport } from '../server/local-agent/native-rpc-transport';

export type NativeProbeFailure =
  | { kind: 'spawn' | 'stderr'; message: string }
  | { kind: 'rpc'; code: number; message: string };

/** Node-only cross-layer fixture for #456: real AI implementation, synthetic
 * Electron delivery and Codex JSON-RPC process. Callers must unset provider auth
 * environment variables and supply an empty temporary CODEX_HOME.
 * This does not exercise ipcMain, Windows packaging/npm launchers or real accounts.
 */
export function createNativeAgentFlowFixture(directory: string) {
  if (process.env.CODEX_HOME !== directory)
    throw new Error('Native flow fixture requires its isolated CODEX_HOME');
  const db = createLocalAgentSqlite();
  const store = new LocalAgentRepository(db);
  const registry = new AgentInstanceRegistry(new AgentInstancePowerSyncRepository(db), 'desktop');
  let profile = 'profile-a';
  let failure: 'none' | 'quota' = 'none';
  let probeFailure: NativeProbeFailure | undefined;
  const requests: Array<[string, unknown]> = [];
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  function createRuntime() {
    const owner = profile;
    return new LocalAgentRuntime({
      store,
      cwd: directory,
      isActive: () => profile === owner,
      createDriver: (connection) =>
        new CodexDriver(connection, directory, (options) => {
          if (probeFailure?.kind === 'spawn')
            return new NativeRpcTransport({
              ...options,
              executable: join(directory, 'PRIVATE_HOME_FIXTURE', 'missing-codex'),
              args: [],
              requestTimeoutMs: 2000,
            });
          const script = `
          const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
          require('readline').createInterface({input:process.stdin}).on('line', line => {
            const frame = JSON.parse(line);
            const reply = result => send({id:frame.id,result});
            const probeFailure = ${JSON.stringify(probeFailure ?? null)};
            if (frame.method === 'initialize' && probeFailure) {
              process.stderr.write(probeFailure.message);
              if (probeFailure.kind === 'rpc') send({id:frame.id,error:{code:probeFailure.code,message:probeFailure.message}});
              else process.exit(17);
              return;
            }
            if (frame.method === 'initialize') reply({userAgent:'codex/0.154.0 (fixture)'});
            else if (frame.method === 'account/read') reply({account:{type:'chatgpt',email:'${owner}@example.test',planType:'team'},requiresOpenaiAuth:true});
            else if (frame.method === 'model/list') reply({data:[{id:'fixture-model',model:'fixture-model',displayName:'Fixture model'}],nextCursor:null});
            else if (frame.method === 'thread/start' || frame.method === 'thread/resume') reply({thread:{id:frame.params.threadId || '${owner}-thread'}});
            else if (frame.method === 'turn/start') {
              if (${JSON.stringify(failure)} === 'quota') {
                send({id:frame.id,error:{code:429,message:'insufficient_quota PRIVATE_FIXTURE_DIAGNOSTIC'}});
              } else {
                reply({turn:{id:'fixture-turn'}});
                send({method:'item/agentMessage/delta',params:{threadId:'${owner}-thread',turnId:'fixture-turn',itemId:'reply',delta:'Fixture answer'}});
                send({method:'turn/completed',params:{threadId:'${owner}-thread',turn:{id:'fixture-turn',status:'completed'}}});
              }
            }
          });
        `;
          const transport = new NativeRpcTransport({
            ...options,
            executable: process.execPath,
            args: ['-e', script],
            requestTimeoutMs: 2000,
          });
          const request = transport.request.bind(transport);
          transport.request = (method, params) => {
            requests.push([method, params]);
            return request(method, params);
          };
          return transport;
        }),
    });
  }
  let runtime = createRuntime();
  const bridge = {
    on(channel: string, callback: (...args: unknown[]) => void) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)!.add(callback);
    },
    off(channel: string, callback: (...args: unknown[]) => void) {
      listeners.get(channel)?.delete(callback);
    },
  };
  // Host fixture supplies the current Profile, as Electron does; the renderer
  // cannot choose identityId. Real clients validate every outgoing/incoming DTO.
  const ipc = {
    getBridge: () => bridge,
    invoke: async (channel: string, raw: unknown) => {
      const owner = profile;
      const active = runtime;
      if (channel === AIChannels.AGENT_INSTANCE)
        return ok(await registry.execute(owner, AgentRegistryCommandSchema.parse(raw)));
      if (channel === AIChannels.LOCAL_AGENT) {
        const input = LocalAgentClientCommandSchema.parse(raw);
        switch (input.action) {
          case 'get_default':
            return ok(await active.getDefaultChoice(owner));
          case 'set_default':
            await active.setDefaultChoice(owner, input.choice);
            return ok(null);
          case 'list_connections':
            return ok(await active.listConnections(owner));
          case 'probe_default':
            return ok(await active.probeDefaultDriver(owner, input.driver));
          case 'probe_connection':
            return ok(await active.probeConnection(owner, input.id));
          case 'list_conversations':
            return ok(await active.listConversations(owner));
          case 'create_conversation':
            return ok(await active.createConversation(owner, input.conversation));
          default:
            throw new Error(`Unexpected local command ${input.action}`);
        }
      }
      if (channel === AIChannels.RUNTIME_ASSISTANT_START) {
        const { streamId, command } = raw as { streamId: string; command: unknown };
        const input = AssistantRuntimeClientCommandSchema.parse(command);
        if (input.type !== 'message' || input.runtimeKind !== 'local_agent')
          throw new Error('Unexpected route');
        for await (const event of active.dispatchMessage({ ...input, identityId: owner }))
          for (const listener of [
            ...(listeners.get(AIStreamChannels.RUNTIME_ASSISTANT_EVENT) ?? []),
          ])
            listener({ streamId, event });
        return ok(null);
      }
      if (channel === AIChannels.RUNTIME_ASSISTANT_ATTENTION_LIST) return ok({ items: [] });
      if (channel === AIChannels.RUNTIME_ASSISTANT_ASK_USER_PENDING) return ok([]);
      if (channel === AIChannels.RUNTIME_ASSISTANT_HISTORY) {
        const { conversationId } = raw as { conversationId: string };
        return ok(await active.listMessages({ identityId: owner, conversationId }));
      }
      throw new Error(`Unexpected IPC channel ${channel}`);
    },
  };
  const port = ipc as unknown as IResultIpcClient;
  return {
    store,
    registry,
    requests,
    local: createLocalAgentIpcClient(port),
    registryClient: createAgentRegistryIpcClient(port),
    assistant: createAssistantRuntimeIpcClient(port),
    identity: () => profile,
    setProbeFailure: (value: NativeProbeFailure) => {
      probeFailure = value;
    },
    setFailure: () => {
      failure = 'quota';
    },
    async switchProfile() {
      await runtime.dispose();
      profile = 'profile-b';
      failure = 'none';
      runtime = createRuntime();
    },
    async close() {
      await runtime.dispose();
      db.close();
    },
  };
}
