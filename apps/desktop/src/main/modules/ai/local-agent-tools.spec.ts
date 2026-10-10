import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { expect, it } from 'vitest';
import { LocalAgentRepository, LocalAgentRuntime } from '@memoflow/ai';
import type { AssistantRuntimeEvent } from '@memoflow/contracts/ai';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { createTimeContext } from '@memoflow/time';
import { createDesktopLocalAgentTools } from './local-agent-tools';

const owner = 'IdentityId_00000000-0000-4000-8000-000000000001';
const goalId = 'IGoalId_00000000-0000-4000-8000-000000000001';
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE ai_local_agent_connections(id TEXT PRIMARY KEY,identity_id TEXT,record_json TEXT);
  CREATE TABLE ai_local_conversations(id TEXT PRIMARY KEY,identity_id TEXT,record_json TEXT);
  CREATE TABLE ai_local_conversation_items(id TEXT PRIMARY KEY,identity_id TEXT,conversation_id TEXT,created_at INTEGER,record_json TEXT);
  CREATE TABLE goals(id TEXT PRIMARY KEY,identity_id TEXT,name TEXT,summary TEXT,status TEXT DEFAULT 'Planned',version INTEGER DEFAULT 1,created_at TEXT,updated_at TEXT,deleted_at TEXT,archived_at TEXT,start_kind TEXT,start_date TEXT,target_kind TEXT,target_end_date TEXT,completed_at TEXT,sort_order INTEGER DEFAULT 0);
  CREATE TABLE key_results(id TEXT,goal_id TEXT,title TEXT,unit TEXT,initial_value REAL,current_value REAL,tracking_base_value REAL,target_value REAL,aggregation_method TEXT,target_kind TEXT,target_end_date TEXT,weight INTEGER,"order" INTEGER,created_at TEXT,updated_at TEXT);`);
  sql
    .prepare('INSERT INTO goals(id,identity_id,name,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run(
      goalId,
      owner,
      'BYOA acceptance orchard-7341',
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
    );
  let goalReads = 0;
  const parameters = (p: unknown[] = []) => p as SQLInputValue[];
  let transaction = Promise.resolve();
  const db: IElectronDatabase = {
    async execute(q, p) {
      return { rowsAffected: Number(sql.prepare(q).run(...parameters(p)).changes) };
    },
    async getAll<T>(q: string, p?: unknown[]) {
      if (q.includes('FROM goals')) goalReads++;
      return sql.prepare(q).all(...parameters(p)) as T[];
    },
    async getOptional<T>(q: string, p?: unknown[]) {
      return (sql.prepare(q).get(...parameters(p)) ?? null) as T | null;
    },
    async get<T>(q: string, p?: unknown[]) {
      return sql.prepare(q).get(...parameters(p)) as T;
    },
    async writeTransaction(work) {
      const previous = transaction;
      let unlock!: () => void;
      transaction = new Promise((resolve) => {
        unlock = resolve;
      });
      await previous;
      sql.exec('BEGIN');
      try {
        const result = await work(db);
        sql.exec('COMMIT');
        return result;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      } finally {
        unlock();
      }
    },
  };
  const store = new LocalAgentRepository(db);
  const bridge = createDesktopLocalAgentTools(db, store, () => true, {
    getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
  });
  return { db, store, bridge, goalReads: () => goalReads, close: () => sql.close() };
}

it('serves the real Goal owner through the authenticated native MCP bridge', async () => {
  const f = fixture();
  try {
    const connection = await f.store.createConnection(owner, {
      driver: 'codex',
      name: 'Codex',
      executablePath: 'codex',
      enabled: true,
      writeScopes: [],
    });
    const grant = await f.bridge.open({
      identityId: owner,
      connectionId: connection.id,
      conversationId: 'test',
      runId: 'test',
    });
    const response = await fetch(grant.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${grant.token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'goal_search', arguments: { query: 'orchard', limit: 1 } },
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('BYOA acceptance orchard-7341');
    expect(body).toContain(goalId);
    const envelope = JSON.parse(
      body
        .split('\n')
        .find((line) => line.startsWith('data: '))!
        .slice(6),
    );
    expect(envelope.result.content[0].text).toContain(goalId);
    expect(f.goalReads()).toBeGreaterThan(0);
  } finally {
    await f.bridge.dispose();
    f.close();
  }
});

for (const driver of ['codex', 'claude', 'pi', 'dsh'] as const)
  it.runIf(process.env[`MEMOFLOW_REAL_${driver.toUpperCase()}`] === '1')(
    `uses the installed ${driver} CLI to read a Goal and resume the same native session`,
    async () => {
      const f = fixture();
      const cwd = await mkdtemp(join(tmpdir(), 'memoflow-native-codex-'));
      const runtime = new LocalAgentRuntime({ store: f.store, bridge: f.bridge, cwd });
      try {
        // This opt-in run must not silently import the operator's default DSH
        // commercial gateway. Demand an explicit isolated home and Ollama route.
        const dshHome = driver === 'dsh' ? process.env.MEMOFLOW_DSH_HOME : undefined;
        if (driver === 'dsh') {
          if (!dshHome || !isAbsolute(dshHome))
            throw new Error('MEMOFLOW_DSH_HOME must be an absolute isolated DSH profile path');
          const route = (() => {
            try {
              return JSON.parse(process.env.MEMOFLOW_DSH_MODEL ?? '');
            } catch {
              return null;
            }
          })();
          if (
            !Array.isArray(route) ||
            route.length !== 2 ||
            route[0] !== 'ollama' ||
            typeof route[1] !== 'string' ||
            !route[1]
          )
            throw new Error('MEMOFLOW_DSH_MODEL must select an explicit Ollama-only ACP model');
        }
        const connection = await runtime.saveConnection(owner, {
          driver,
          name: `Real ${driver} acceptance`,
          executablePath:
            driver === 'claude'
              ? (process.env.MEMOFLOW_CLAUDE_EXECUTABLE ?? driver)
              : driver === 'dsh'
                ? (process.env.MEMOFLOW_DSH_EXECUTABLE ?? driver)
                : driver,
          enabled: true,
          writeScopes: [],
          ...(dshHome ? { homePath: dshHome } : {}),
        });
        const status = await runtime.probeConnection(owner, connection.id);
        expect(status.status).toBe('ready');
        if (status.status !== 'ready') throw new Error(`Installed ${driver} unavailable`);
        const requestedModel =
          process.env[`MEMOFLOW_${driver.toUpperCase()}_MODEL`] ??
          (driver === 'codex'
            ? 'gpt-6-astra'
            : driver === 'claude'
              ? 'sonnet'
              : driver === 'pi'
                ? 'openai-codex/gpt-6-astra'
                : '');
        if (driver === 'dsh' && !requestedModel)
          throw new Error('MEMOFLOW_DSH_MODEL must be set to the exact ACP model ID');
        // Never silently test the first catalog entry when an explicit Ollama
        // model (or any other native model) is missing. That used to allow
        // a supposedly free acceptance run to invoke an unrelated channel.
        const model = status.models.find((candidate) => candidate.id === requestedModel);
        if (!model)
          throw new Error(
            `Requested ${driver} model ${requestedModel} is unavailable in the native catalog`,
          );
        const conversation = await runtime.createConversation(owner, {
          connectionId: connection.id,
          modelId: model.id,
          name: 'Native tool acceptance',
        });
        async function turn(content: string) {
          const events: AssistantRuntimeEvent[] = [];
          for await (const event of runtime.dispatchMessage({
            identityId: owner,
            conversationId: conversation.id,
            content,
            signal: AbortSignal.timeout(300_000),
          })) {
            events.push(event);
            if (event.type !== 'assistant.message.delta')
              console.info(
                '[native acceptance]',
                driver,
                model.id,
                event.type,
                event.type === 'assistant.activity'
                  ? event.data.label
                  : event.type === 'assistant.request.required' && event.data.type === 'permission'
                    ? event.data.title
                    : event.type === 'assistant.run.failed'
                      ? event.data.code
                      : '',
              );
            if (event.type === 'assistant.request.required' && event.data.type === 'permission')
              runtime.respond(owner, {
                conversationId: conversation.id,
                runId: event.runId,
                requestId: event.data.requestId,
                response: {
                  type: 'permission',
                  decision:
                    event.data.title.includes('goal_search') ||
                    event.data.title.includes('tool_search')
                      ? 'approve_once'
                      : 'decline',
                },
              });
          }
          expect(events.at(-1)?.type).toBe('assistant.run.completed');
          return events;
        }
        await turn(
          'Use only the MemoFlow MCP goal_search tool to search for orchard. Report the exact matching goal name. Do not use shell, files, or any other MCP server.',
        );
        expect(f.goalReads()).toBeGreaterThan(0);
        const binding = await f.store.getConversation(owner, conversation.id);
        expect(binding.nativeSessionId).toBeTruthy();
        const readsBefore = f.goalReads();
        await turn(
          'Use MemoFlow goal_search again for orchard and repeat the exact matching name. Use no other tools.',
        );
        expect(f.goalReads()).toBeGreaterThan(readsBefore);
        expect((await f.store.getConversation(owner, conversation.id)).nativeSessionId).toBe(
          binding.nativeSessionId,
        );
        const history = await runtime.listMessages({
          identityId: owner,
          conversationId: conversation.id,
        });
        expect(
          history.messages
            .filter((m) => m.role === 'assistant')
            .every((m) => m.content.includes('orchard-7341')),
        ).toBe(true);
      } finally {
        await runtime.dispose();
        f.close();
        await rm(cwd, { recursive: true, force: true });
      }
    },
    660_000,
  );

// A real child ACP process exercises the complete native protocol, owner-backed
// MCP Goal read, stable session identity, and Desktop event persistence without
// invoking a model/provider. The actual DSH inference acceptance stays opt-in.
it.skipIf(process.platform === 'win32')(
  'integrates first-class DSH via ACP stdio with two authenticated Goal MCP turns',
  async () => {
    const f = fixture();
    const cwd = await mkdtemp(join(tmpdir(), 'memoflow-dsh-acp-e2e-'));
    const executable = join(cwd, 'synthetic-dsh.mjs');
    const selectedModel = JSON.stringify(['ollama', 'gpt-oss:20b']);
    await writeFile(
      executable,
      `#!/usr/bin/env node
import readline from 'node:readline';
const route=JSON.stringify(['ollama','gpt-oss:20b']);
const catalog=[{
  id:'model',name:'Model',type:'select',currentValue:route,
  options:[{group:'ollama',name:'Ollama',options:[{value:route,name:'gpt-oss:20b'}]}]
}];
const line=(msg)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...msg})+'\\n');
let grant;
for await(const raw of readline.createInterface({input:process.stdin})){
  try {
    const request=JSON.parse(raw);
    if(request.method==='initialize'){
      line({id:request.id,result:{protocolVersion:1,agentCapabilities:{mcpCapabilities:{http:true},sessionCapabilities:{resume:{},close:{}}}}});
    }else if(request.method==='session/new'||request.method==='session/resume'){
      grant=request.params.mcpServers?.[0];
      line({id:request.id,result:{...(request.method==='session/new'?{sessionId:'acp-fixture-native-1'}:{}),configOptions:catalog}});
    }else if(request.method==='session/close'){
      line({id:request.id,result:{}});
    }else if(request.method==='session/prompt'){
      if(!grant) throw Error('Missing per-turn MemoFlow MCP grant');
      const response=await fetch(grant.url,{
        method:'POST',
        headers:{Authorization:grant.headers[0].value,'content-type':'application/json','accept':'application/json, text/event-stream'},
        body:JSON.stringify({jsonrpc:'2.0',id:93,method:'tools/call',params:{name:'goal_search',arguments:{query:'orchard',limit:1}}})
      });
      if(!response.ok) throw Error('MCP request failed '+response.status);
      const body=await response.text();
      if(!body.includes('BYOA acceptance orchard-7341')) throw Error('Goal owner response missing');
      line({method:'session/update',params:{sessionId:'acp-fixture-native-1',update:{sessionUpdate:'tool_call',toolCallId:'goal-93',title:'goal_search',status:'in_progress'}}});
      line({method:'session/update',params:{sessionId:'acp-fixture-native-1',update:{sessionUpdate:'tool_call_update',toolCallId:'goal-93',status:'completed'}}});
      line({method:'session/update',params:{sessionId:'acp-fixture-native-1',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'BYOA acceptance orchard-7341'}}}});
      line({id:request.id,result:{stopReason:'end_turn'}});
    }
  }catch(err){
    process.stderr.write('Synthetic ACP fixture: '+err.message+'\\n');
    if(raw.includes('session/prompt')) line({id:JSON.parse(raw).id,error:{code:-32001,message:'fixture protocol failure'}});
  }
}
`,
      { mode: 0o700 },
    );
    await chmod(executable, 0o700);
    const runtime = new LocalAgentRuntime({ store: f.store, bridge: f.bridge, cwd });
    try {
      const connection = await runtime.saveConnection(owner, {
        driver: 'dsh',
        name: 'Synthetic ACP DSH',
        executablePath: executable,
        enabled: true,
        writeScopes: [],
      });
      const status = await runtime.probeConnection(owner, connection.id);
      expect(status.status).toBe('ready');
      if (status.status !== 'ready') throw new Error('ACP fixture not ready');
      expect(status.models).toContainEqual({
        id: selectedModel,
        name: 'gpt-oss:20b',
        provider: 'Ollama',
      });
      const conversation = await runtime.createConversation(owner, {
        connectionId: connection.id,
        modelId: selectedModel,
        name: 'Synthetic ACP Goal acceptance',
      });
      let binding: string | null | undefined;
      for (let turn = 0; turn < 2; turn++) {
        const previousReads = f.goalReads();
        const events: AssistantRuntimeEvent[] = [];
        for await (const event of runtime.dispatchMessage({
          identityId: owner,
          conversationId: conversation.id,
          content: 'Use the MemoFlow MCP goal_search tool to find orchard.',
          signal: AbortSignal.timeout(15_000),
        }))
          events.push(event);
        expect(events.at(-1)?.type).toBe('assistant.run.completed');
        expect(events.some((event) => event.type === 'assistant.activity')).toBe(true);
        expect(f.goalReads()).toBeGreaterThan(previousReads);
        const saved = await f.store.getConversation(owner, conversation.id);
        expect(saved.nativeSessionId).toBe('acp-fixture-native-1');
        if (turn > 0) expect(saved.nativeSessionId).toBe(binding);
        binding = saved.nativeSessionId;
      }
      const messages = await runtime.listMessages({
        identityId: owner,
        conversationId: conversation.id,
      });
      expect(messages.messages.filter((m) => m.role === 'assistant')).toHaveLength(2);
      expect(
        messages.messages
          .filter((m) => m.role === 'assistant')
          .every((m) => m.content.includes('orchard-7341')),
      ).toBe(true);
    } finally {
      await runtime.dispose();
      f.close();
      await rm(cwd, { recursive: true, force: true });
    }
  },
  40_000,
);
