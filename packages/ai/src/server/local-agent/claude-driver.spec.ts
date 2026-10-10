import { expect, it } from 'vitest';
import type { HookInput } from '@anthropic-ai/claude-agent-sdk';
import type { LocalAgentConnection } from '@memoflow/contracts/ai';
import { ClaudeDriver, type ClaudeQueryFactory } from './claude-driver';
import { nativeIdentity } from './native-identity';

const connection: LocalAgentConnection = {
  id: 'claude',
  driver: 'claude',
  name: 'Claude',
  executablePath: process.execPath,
  enabled: true,
  writeScopes: [],
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
};
it('rejects a changed account before giving the SDK the old session ID', async () => {
  const resumes: Array<string | undefined> = [];
  const factory: ClaudeQueryFactory = ({ options }) => {
    resumes.push(options.resume);
    return {
      async initializationResult() {
        return {
          account: { email: 'new@example.test' },
          models: [{ value: 'sonnet', displayName: 'Sonnet' }],
        };
      },
      async interrupt() {},
      close() {},
      async *[Symbol.asyncIterator]() {},
    };
  };
  const driver = new ClaudeDriver(connection, '/tmp', factory);
  const stream = driver.run({
    nativeSessionId: 'private-old-session',
    accountFingerprint: await nativeIdentity('claude', undefined, { email: 'old@example.test' }),
    modelId: 'sonnet',
    content: 'Hi',
  });
  await expect(stream.next()).rejects.toMatchObject({ code: 'LOCAL_AGENT_SESSION_UNAVAILABLE' });
  expect(resumes).toEqual([undefined]);
});
it('uses SDK initialization for a model catalog without sending a probe prompt', async () => {
  let prompts = 0;
  let closed = false;
  const factory: ClaudeQueryFactory = ({ prompt, options }) => {
    expect(options.persistSession).toBe(false);
    expect(options.strictMcpConfig).toBe(true);
    void (async () => {
      for await (const _message of prompt) prompts++;
    })();
    return {
      async initializationResult() {
        return {
          account: { email: 'test@example.test', tokenSource: 'oauth' },
          models: [{ value: 'sonnet', displayName: 'Sonnet' }],
        };
      },
      async interrupt() {},
      close() {
        closed = true;
      },
      async *[Symbol.asyncIterator]() {},
    };
  };
  const driver = new ClaudeDriver(connection, '/tmp', factory);
  expect(await driver.probe()).toMatchObject({
    status: 'ready',
    models: [{ id: 'sonnet', name: 'Sonnet' }],
  });
  expect(prompts).toBe(0);
  expect(closed).toBe(true);
});
it('resumes the SDK session, injects MCP, answers native permission and streams once', async () => {
  const initializationCalls: Array<string | undefined> = [];
  const factory: ClaudeQueryFactory = ({ prompt, options }) => ({
    async initializationResult() {
      initializationCalls.push(options.resume);
      if (options.resume)
        expect(options.mcpServers).toMatchObject({
          memoflow: { url: 'http://127.0.0.1/mcp', headers: { Authorization: 'Bearer token' } },
        });
      else expect(options.mcpServers).toEqual({});
      return {
        account: { email: 'test@example.test', tokenSource: 'oauth' },
        models: [{ value: 'sonnet', displayName: 'Sonnet' }],
      };
    },
    async interrupt() {},
    close() {},
    async *[Symbol.asyncIterator]() {
      for await (const message of prompt) {
        expect(message.message.content).toBe('Hello');
        yield { type: 'system', subtype: 'init', session_id: 'native' };
        const allowed = await options.canUseTool?.(
          'Bash',
          { command: 'pwd' },
          { signal: new AbortController().signal, toolUseID: 'tool' },
        );
        expect(allowed).toMatchObject({ behavior: 'allow' });
        yield {
          type: 'stream_event',
          session_id: 'native',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Answer' } },
        };
        yield {
          type: 'assistant',
          session_id: 'native',
          message: { content: [{ type: 'text', text: 'Answer' }] },
        };
        yield {
          type: 'stream_event',
          session_id: 'native',
          event: {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 4 },
          },
        };
        yield { type: 'result', subtype: 'success', session_id: 'native', result: 'Answer' };
        break;
      }
    },
  });
  const driver = new ClaudeDriver(connection, '/tmp', factory);
  const events = [];
  for await (const event of driver.run({
    nativeSessionId: 'native',
    accountFingerprint: await nativeIdentity('claude', undefined, {
      email: 'test@example.test',
      tokenSource: 'oauth',
    }),
    modelId: 'sonnet',
    content: 'Hello',
    mcp: { url: 'http://127.0.0.1/mcp', token: 'token' },
  })) {
    events.push(event);
    if (event.type === 'request')
      expect(
        driver.respond(event.request.requestId, { type: 'permission', decision: 'approve_once' }),
      ).toBe(true);
  }
  expect(events.filter((event) => event.type === 'delta')).toEqual([
    { type: 'delta', content: 'Answer' },
  ]);
  expect(events.at(-1)).toEqual({ type: 'completed' });
  expect(initializationCalls).toEqual([undefined, 'native']);
  expect(driver.respond('stale', { type: 'permission', decision: 'approve_once' })).toBe(false);
});
it('gates MemoFlow MCP tool calls before SDK allow rules and requires approval for writes', async () => {
  const requests: string[] = [];
  const decisions: string[] = [];
  const factory: ClaudeQueryFactory = ({ prompt, options }) => ({
    async initializationResult() {
      return {
        account: { email: 'test@example.test', tokenSource: 'oauth' },
        models: [{ value: 'sonnet', displayName: 'Sonnet' }],
      };
    },
    async interrupt() {},
    close() {},
    async *[Symbol.asyncIterator]() {
      for await (const _message of prompt) {
        yield { type: 'system', session_id: 'native' };
        // A bare wildcard grants every MCP tool without consulting canUseTool.
        expect(options.allowedTools).toEqual([]);
        const hook = options.hooks?.PreToolUse?.[0]?.hooks[0];
        expect(hook).toBeDefined();
        const check = (name: string) =>
          hook!(
            {
              hook_event_name: 'PreToolUse',
              tool_name: name,
              tool_input: { name: 'test' },
            } as unknown as HookInput,
            'tool',
            { signal: new AbortController().signal },
          );
        expect(await check('mcp__memoflow__goal_search')).toMatchObject({
          hookSpecificOutput: { permissionDecision: 'allow' },
        });
        expect(await check('mcp__memoflow__task_plan_get')).toMatchObject({
          hookSpecificOutput: { permissionDecision: 'allow' },
        });
        expect(await check('mcp__memoflow__unknown_new_tool')).toMatchObject({
          hookSpecificOutput: { permissionDecision: 'deny' },
        });
        expect(await check('Bash')).toEqual({});
        const allowed = await check('mcp__memoflow__goal_create');
        decisions.push(
          (allowed.hookSpecificOutput as { permissionDecision?: string })?.permissionDecision ?? '',
        );
        const denied = await check('mcp__memoflow__goal_update');
        decisions.push(
          (denied.hookSpecificOutput as { permissionDecision?: string })?.permissionDecision ?? '',
        );
        yield { type: 'result', subtype: 'success', session_id: 'native' };
        break;
      }
    },
  });
  const driver = new ClaudeDriver(connection, '/tmp', factory);
  for await (const event of driver.run({
    modelId: 'sonnet',
    content: 'Hello',
    mcp: { url: 'http://127.0.0.1/mcp', token: 'token' },
  })) {
    if (event.type === 'request') {
      expect(event.request.type).toBe('permission');
      requests.push(event.request.title);
      expect(
        driver.respond(event.request.requestId, {
          type: 'permission',
          decision: requests.length === 1 ? 'approve_once' : 'decline',
        }),
      ).toBe(true);
    }
  }
  expect(requests).toHaveLength(2);
  expect(requests[0]).toContain('mcp__memoflow__goal_create');
  expect(requests[1]).toContain('mcp__memoflow__goal_update');
  expect(decisions).toEqual(['allow', 'deny']);
});

it('retires a permission card when the native request signal expires', async () => {
  let expiredId = '';
  const signal = new AbortController();
  const factory: ClaudeQueryFactory = ({ prompt, options }) => ({
    async initializationResult() {
      return {
        account: { tokenSource: 'oauth' },
        models: [{ value: 'sonnet', displayName: 'Sonnet' }],
      };
    },
    async interrupt() {},
    close() {},
    async *[Symbol.asyncIterator]() {
      for await (const _message of prompt) {
        yield { type: 'system', session_id: 'native' };
        expect(
          await options.canUseTool?.('Bash', {}, { signal: signal.signal, toolUseID: 'tool' }),
        ).toMatchObject({ behavior: 'deny' });
        yield { type: 'result', subtype: 'success', session_id: 'native' };
        break;
      }
    },
  });
  const driver = new ClaudeDriver(connection, '/tmp', factory);
  const events = [];
  for await (const event of driver.run({ modelId: 'sonnet', content: 'Hello' })) {
    events.push(event);
    if (event.type === 'request') {
      expiredId = event.request.requestId;
      signal.abort();
    }
  }
  expect(events).toContainEqual({
    type: 'request_resolved',
    requestId: expiredId,
    resolution: 'cancelled',
  });
  expect(driver.respond(expiredId, { type: 'permission', decision: 'approve_once' })).toBe(false);
});
