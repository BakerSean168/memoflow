import { expect, it, vi } from 'vitest';
import type { HookInput } from '@anthropic-ai/claude-agent-sdk';
import { LocalAgentStatusSchema } from '@memoflow/ai-contracts';
import type { LocalAgentConnection } from '@memoflow/ai-contracts';
import { ClaudeDriver, type ClaudeQueryFactory } from './claude-driver';
import { nativeIdentity } from './native-identity';

import { probeNativeVersion } from './native-executable';

const privacyLogs = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@memoflow/utils/logger', () => ({ createLogger: () => privacyLogs }));

vi.mock('./native-executable', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./native-executable')>()),
  probeNativeVersion: vi.fn(async () => undefined),
}));

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
          models: [
            {
              value: 'sonnet',
              displayName: 'Sonnet',
              supportsEffort: true,
              supportedEffortLevels: ['low', 'medium', 'high'],
            },
          ],
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
  const result = await driver.probe();
  expect(result).toMatchObject({
    status: 'ready',
    models: [{ id: 'sonnet', name: 'Sonnet', reasoningEfforts: ['low', 'medium', 'high'] }],
  });
  // SDK package version is not proof of the installed Claude CLI version.
  expect(result).not.toHaveProperty('version');
  expect(prompts).toBe(0);
  expect(closed).toBe(true);
});
it('passes model-validated effort to the Claude SDK query, not prompt text', async () => {
  let applied: string | undefined;
  const factory: ClaudeQueryFactory = ({ prompt, options }) => {
    applied = options.effort;
    return {
      async initializationResult() {
        return {
          account: { email: 'test@example.test', tokenSource: 'oauth' },
          models: [
            {
              value: 'sonnet',
              displayName: 'Sonnet',
              supportsEffort: true,
              supportedEffortLevels: ['low', 'medium', 'high'],
            },
          ],
        };
      },
      async interrupt() {},
      close() {},
      async *[Symbol.asyncIterator]() {
        for await (const _message of prompt) {
          yield { type: 'result', subtype: 'success', session_id: 'native' };
          break;
        }
      },
    };
  };
  const driver = new ClaudeDriver(connection, '/tmp', factory);
  for await (const _event of driver.run({
    modelId: 'sonnet',
    modelOptions: { reasoningEffort: 'high' },
    content: 'Hello',
  })) {
  }
  expect(applied).toBe('high');
});

it('resumes the SDK session, injects MCP, answers native permission and streams once', async () => {
  const initializationCalls: Array<string | undefined> = [];
  const factory: ClaudeQueryFactory = ({ prompt, options }) => ({
    async initializationResult() {
      initializationCalls.push(options.resume);
      if (options.resume)
        expect(options.mcpServers).toMatchObject({
          memoflow: {
            url: 'http://127.0.0.1/mcp',
            headers: { Authorization: '${MEMOFLOW_MCP_AUTHORIZATION}' },
          },
        });
      else expect(options.mcpServers).toEqual({});
      if (options.resume) {
        expect(options.env?.MEMOFLOW_MCP_AUTHORIZATION).toBe('Bearer token');
        expect(JSON.stringify(options.mcpServers)).not.toContain('Bearer token');
      } else expect(options.env?.MEMOFLOW_MCP_AUTHORIZATION).toBeUndefined();
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
it('allows only bridge-registered MemoFlow tools, including every Goal panel tool', async () => {
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
        for (const name of [
          'goal_panel_open',
          'goal_panel_patch',
          'goal_panel_add_key_result',
          'goal_panel_remove_key_result',
          'goal_panel_focus',
          'goal_panel_snapshot',
          'goal_panel_release',
          'goal_panel_submit',
        ]) {
          expect(await check(`mcp__memoflow__${name}`)).toMatchObject({
            hookSpecificOutput: { permissionDecision: 'allow' },
          });
        }
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
    mcp: {
      url: 'http://127.0.0.1/mcp',
      token: 'token',
      toolNames: [
        'goal_search',
        'task_plan_get',
        'goal_create',
        'goal_update',
        'goal_panel_open',
        'goal_panel_patch',
        'goal_panel_add_key_result',
        'goal_panel_remove_key_result',
        'goal_panel_focus',
        'goal_panel_snapshot',
        'goal_panel_release',
        'goal_panel_submit',
      ],
    },
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
  expect(requests).toHaveLength(0);
  expect(decisions).toEqual(['allow', 'allow']);
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

it('does not report an authenticated but empty catalog as ready', async () => {
  const factory: ClaudeQueryFactory = () => ({
    async initializationResult() {
      return { account: { tokenSource: 'oauth' }, models: [] };
    },
    async interrupt() {},
    close() {},
    async *[Symbol.asyncIterator]() {},
  });
  expect(await new ClaudeDriver(connection, '/tmp', factory).probe()).toMatchObject({
    status: 'unavailable',
  });
});

it('reports the selected Claude executable version independently of the SDK catalog', async () => {
  vi.mocked(probeNativeVersion).mockResolvedValueOnce('2.1.31');
  const factory: ClaudeQueryFactory = () => ({
    async initializationResult() {
      return {
        account: { tokenSource: 'oauth' },
        models: [{ value: 'sonnet', displayName: 'Sonnet' }],
      };
    },
    async interrupt() {},
    close() {},
    async *[Symbol.asyncIterator]() {},
  });
  expect(await new ClaudeDriver(connection, '/tmp', factory).probe()).toMatchObject({
    status: 'ready',
    version: '2.1.31',
  });
  expect(probeNativeVersion).toHaveBeenLastCalledWith(connection, '/tmp');
});

it('scopes visibility only when SDK initialization reports an account identity', async () => {
  async function probe(email?: string) {
    const factory: ClaudeQueryFactory = () => ({
      async initializationResult() {
        return {
          account: { tokenSource: 'oauth', ...(email ? { email } : {}) },
          models: [{ value: 'sonnet', displayName: 'Sonnet' }],
        };
      },
      async interrupt() {},
      close() {},
      async *[Symbol.asyncIterator]() {},
    });
    return new ClaudeDriver(connection, '/tmp', factory).probe();
  }
  const first = await probe('a@example.test');
  expect(first.status).toBe('ready');
  if (first.status !== 'ready') throw new Error('Expected catalog');
  expect(first.modelVisibilityContext).toMatch(/^mvc1:[0-9a-f]{64}$/);
  expect(await probe('a@example.test')).toHaveProperty(
    'modelVisibilityContext',
    first.modelVisibilityContext,
  );
  const changed = await probe('b@example.test');
  if (changed.status !== 'ready') throw new Error('Expected catalog');
  expect(changed.modelVisibilityContext).not.toBe(first.modelVisibilityContext);
  expect(await probe()).not.toHaveProperty('modelVisibilityContext');
});

it.each([
  ['spawn ENOENT', 'not_installed', 'The configured Agent executable could not be started.'],
  [
    '401 Unauthorized',
    'login_required',
    'Sign in using the Agent’s native login command, then refresh.',
  ],
  [
    'SDK initialization failed',
    'unavailable',
    'The local Agent is unavailable. Check its native configuration.',
  ],
])('normalizes Claude %s before publishing the status DTO', async (prefix, status, message) => {
  const diagnostic = `${prefix} C:\\Users\\PRIVATE_HOME_FIXTURE PRIVATE_ACCOUNT_FIXTURE@example.test api_key=PRIVATE_KEY_FIXTURE`;
  const factory: ClaudeQueryFactory = ({ options }) => {
    options.stderr?.(diagnostic);
    throw new Error(diagnostic);
  };
  const result = await new ClaudeDriver(connection, '/tmp', factory).probe();
  expect(LocalAgentStatusSchema.parse(result)).toEqual({ status, message });
  expect(JSON.stringify(result)).not.toContain('PRIVATE_');
});

it('logs only schema paths/codes when a private Claude frame is rejected', async () => {
  privacyLogs.warn.mockClear();
  const factory: ClaudeQueryFactory = () => ({
    async initializationResult() {
      return {
        account: { tokenSource: 'oauth' },
        models: [{ value: 'sonnet', displayName: 'Sonnet' }],
      };
    },
    async interrupt() {},
    close() {},
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'stream_event',
        session_id: 'fixture-session',
        event: {
          type: 'content_block_delta',
          delta: {
            type: 'text_delta',
            text: {
              diagnostic:
                'C:\\Users\\PRIVATE_HOME_FIXTURE PRIVATE_ACCOUNT_FIXTURE@example.test PRIVATE_KEY_FIXTURE',
            },
          },
        },
      };
    },
  });
  const driver = new ClaudeDriver(connection, '/tmp', factory);
  try {
    const run = driver.run({ modelId: 'sonnet', content: 'Synthetic prompt' });
    await expect(
      (async () => {
        for await (const _event of run) {
          /* drain */
        }
      })(),
    ).rejects.toMatchObject({
      code: 'LOCAL_AGENT_PROTOCOL_ERROR',
      message: 'The local Agent returned an unsupported or invalid protocol message.',
    });
    expect(privacyLogs.warn).toHaveBeenCalledWith('Native protocol shape rejected', {
      issues: [{ path: ['delta', 'text'], code: 'invalid_type' }],
    });
    expect(JSON.stringify(privacyLogs.warn.mock.calls)).not.toContain('PRIVATE_');
  } finally {
    await driver.close();
  }
});
