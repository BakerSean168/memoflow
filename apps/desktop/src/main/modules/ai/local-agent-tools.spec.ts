import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

for (const driver of ['codex', 'claude', 'pi'] as const)
  it.runIf(process.env[`MEMOFLOW_REAL_${driver.toUpperCase()}`] === '1')(
    `uses the installed ${driver} CLI to read a Goal and resume the same native session`,
    async () => {
      const f = fixture();
      const cwd = await mkdtemp(join(tmpdir(), 'memoflow-native-codex-'));
      const runtime = new LocalAgentRuntime({ store: f.store, bridge: f.bridge, cwd });
      try {
        const connection = await runtime.saveConnection(owner, {
          driver,
          name: `Real ${driver} acceptance`,
          executablePath:
            driver === 'claude' ? (process.env.MEMOFLOW_CLAUDE_EXECUTABLE ?? driver) : driver,
          enabled: true,
          writeScopes: [],
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
              : 'openai-codex/gpt-6-astra');
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
