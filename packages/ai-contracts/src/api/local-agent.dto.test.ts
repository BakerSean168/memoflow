import { describe, expect, it } from 'vitest';
import {
  AssistantConversationRefSchema,
  AssistantRuntimeChoiceSchema,
  LocalAgentConnectionInputSchema,
  LocalAgentClientCommandSchema,
  LocalAgentAuthStateSchema,
  LocalAgentRequestResponseSchema,
  LocalAgentStatusSchema,
} from './local-agent.dto';
import {
  AssistantToolNameSchema,
  AssistantRuntimeClientCommandSchema,
} from './assistant-runtime.dto';
import { AssistantRuntimeEventSchema } from './assistant-events.dto';

describe('selectable assistant runtime contracts', () => {
  it('keeps model providers distinct from local Agent connections', () => {
    expect(AssistantRuntimeChoiceSchema.parse({ runtimeKind: 'builtin' })).toEqual({
      runtimeKind: 'builtin',
    });
    expect(
      AssistantRuntimeChoiceSchema.safeParse({
        runtimeKind: 'local_agent',
        connectionId: 'codex-1',
        modelId: 'model',
      }).success,
    ).toBe(true);
    expect(
      AssistantRuntimeChoiceSchema.safeParse({
        runtimeKind: 'local_agent',
        providerId: 'api-key-provider',
      }).success,
    ).toBe(false);
  });

  it('preserves native model trait capabilities but rejects foreign runtime parameters', () => {
    expect(
      LocalAgentStatusSchema.parse({
        status: 'ready',
        models: [
          {
            id: 'gpt-test',
            name: 'GPT Test',
            reasoningEfforts: ['low', 'super-high'],
            defaultReasoningEffort: 'low',
            serviceTiers: [{ id: 'priority', name: 'Fast' }],
          },
        ],
      }).models[0],
    ).toMatchObject({ reasoningEfforts: ['low', 'super-high'] });
    const command = {
      type: 'message',
      conversationId: 'local-chat',
      content: 'Hello',
      surface: 'desktop',
      runtimeKind: 'local_agent',
      nativeModelOptions: { reasoningEffort: 'super-high' },
    };
    expect(AssistantRuntimeClientCommandSchema.safeParse(command).success).toBe(true);
    expect(
      AssistantRuntimeClientCommandSchema.safeParse({
        ...command,
        runtimeKind: 'builtin',
      }).success,
    ).toBe(false);
    expect(
      AssistantRuntimeClientCommandSchema.safeParse({
        ...command,
        nativeModelOptions: { reasoningEffort: 'unsafe\nvalue' },
      }).success,
    ).toBe(false);
    expect(
      AssistantRuntimeClientCommandSchema.safeParse({
        ...command,
        nativeModelOptions: { arbitrary: true },
      }).success,
    ).toBe(false);
  });

  it('rejects host identity and native session injection in conversation references', () => {
    const ref = { runtimeKind: 'local_agent', id: 'conversation-1' };
    expect(AssistantConversationRefSchema.parse(ref)).toEqual(ref);
    for (const extra of [
      { identityId: 'another-owner' },
      { nativeSessionId: 'native-1' },
      { homePath: '/another/profile' },
    ]) {
      expect(AssistantConversationRefSchema.safeParse({ ...ref, ...extra }).success).toBe(false);
    }
  });

  it('accepts explicit binary configuration without accepting arbitrary shell arguments or credentials', () => {
    const connection = {
      driver: 'codex',
      name: 'My Codex',
      executablePath: '/a path/codex',
      enabled: true,
    };
    expect(LocalAgentConnectionInputSchema.parse(connection).writeScopes).toEqual([]);
    expect(
      LocalAgentConnectionInputSchema.safeParse({
        ...connection,
        driver: 'dsh',
        name: 'DeepSeek Harness (DSH)',
        executablePath: 'dsh',
      }).success,
    ).toBe(true);
    expect(
      LocalAgentConnectionInputSchema.safeParse({
        ...connection,
        args: ['--dangerously-bypass-approvals-and-sandbox'],
      }).success,
    ).toBe(false);
    expect(
      LocalAgentConnectionInputSchema.safeParse({
        ...connection,
        apiKey: 'secret',
      }).success,
    ).toBe(false);
  });

  it('displays native tool activity without adding it to executable MemoFlow tool names', () => {
    expect(AssistantToolNameSchema.safeParse('shell').success).toBe(false);
    expect(
      AssistantRuntimeEventSchema.safeParse({
        eventId: 'event-1',
        conversationId: 'conversation-1',
        runId: 'run-1',
        sequence: 1,
        createdAt: 1,
        type: 'assistant.activity',
        data: {
          activityType: 'native_tool',
          toolCallId: 'tool-1',
          label: 'shell',
          state: 'running',
        },
      }).success,
    ).toBe(true);
  });

  it('binds native responses to a conversation, run and request instead of a model-supplied approval', () => {
    expect(
      LocalAgentRequestResponseSchema.safeParse({
        conversationId: 'conversation-1',
        runId: 'run-1',
        requestId: 'request-1',
        response: { type: 'permission', decision: 'approve_once' },
      }).success,
    ).toBe(true);
    expect(LocalAgentRequestResponseSchema.safeParse({ approved: true }).success).toBe(false);
  });
});

describe('implicit default native probe commands', () => {
  it('accepts only a known driver and never renderer-controlled executable, identity or secrets', () => {
    for (const driver of ['codex', 'claude', 'pi', 'dsh']) {
      expect(
        LocalAgentClientCommandSchema.parse({
          action: 'probe_default',
          driver,
        }),
      ).toEqual({
        action: 'probe_default',
        driver,
      });
    }
    expect(
      LocalAgentClientCommandSchema.safeParse({
        action: 'probe_default',
        driver: 'mastra',
      }).success,
    ).toBe(false);
    for (const extra of [
      { executablePath: '/tmp/malicious' },
      { homePath: '/root' },
      { identityId: 'another-owner' },
      { apiKey: 'secret' },
      { args: ['--run'] },
    ]) {
      expect(
        LocalAgentClientCommandSchema.safeParse({
          action: 'probe_default',
          driver: 'codex',
          ...extra,
        }).success,
      ).toBe(false);
    }
  });
});

describe('local instance identity', () => {
  it('accepts optional identity metadata and rejects unsafe slugs, colors and secrets', () => {
    const base = {
      driver: 'codex',
      name: 'Personal',
      executablePath: 'codex',
      enabled: true,
    };
    expect(LocalAgentConnectionInputSchema.safeParse(base).success).toBe(true);
    expect(
      LocalAgentConnectionInputSchema.safeParse({
        ...base,
        instanceSlug: 'codex-personal',
        accentColor: '#6469da',
      }).success,
    ).toBe(true);
    for (const instanceSlug of ['Personal', '../codex', 'a b', '-codex', 'a--b']) {
      expect(LocalAgentConnectionInputSchema.safeParse({ ...base, instanceSlug }).success).toBe(
        false,
      );
    }
    expect(
      LocalAgentConnectionInputSchema.safeParse({
        ...base,
        accentColor: 'url(secret)',
      }).success,
    ).toBe(false);
    expect(LocalAgentConnectionInputSchema.safeParse({ ...base, apiKey: 'secret' }).success).toBe(
      false,
    );
  });
});

it('accepts only an opaque native visibility context on a ready probe, never on saved configuration', () => {
  const context = 'mvc1:' + 'a'.repeat(64);
  expect(
    LocalAgentStatusSchema.parse({
      status: 'ready',
      models: [],
      modelVisibilityContext: context,
    }),
  ).toHaveProperty('modelVisibilityContext', context);
  for (const modelVisibilityContext of [
    '/private/home',
    'alice@example.test',
    'api-key',
    'mvc1:bad',
  ]) {
    expect(
      LocalAgentStatusSchema.safeParse({
        status: 'ready',
        models: [],
        modelVisibilityContext,
      }).success,
    ).toBe(false);
  }
  expect(
    LocalAgentStatusSchema.safeParse({
      status: 'unavailable',
      message: 'Offline',
      modelVisibilityContext: context,
    }).success,
  ).toBe(false);
  expect(
    LocalAgentConnectionInputSchema.safeParse({
      driver: 'codex',
      name: 'Codex',
      executablePath: 'codex',
      enabled: true,
      modelVisibilityContext: context,
    }).success,
  ).toBe(false);
});

it('keeps a bound request limit separate from discovery without allowing raw diagnostics or authentication guesses', () => {
  const status = {
    status: 'ready',
    models: [{ id: 'model', name: 'Model' }],
    modelVisibilityContext: 'mvc1:' + 'a'.repeat(64),
    lastExecutionFailure: {
      code: 'LOCAL_AGENT_QUOTA_EXHAUSTED',
      modelId: 'model',
      occurredAt: 123,
    },
  };
  expect(LocalAgentStatusSchema.parse(status)).toEqual(status);
  for (const lastExecutionFailure of [
    { ...status.lastExecutionFailure, code: 'LOCAL_AGENT_LOGIN_REQUIRED' },
    { ...status.lastExecutionFailure, message: 'PRIVATE_DIAGNOSTIC' },
    { ...status.lastExecutionFailure, occurredAt: -1 },
  ])
    expect(LocalAgentStatusSchema.safeParse({ ...status, lastExecutionFailure }).success).toBe(
      false,
    );
  expect(
    LocalAgentStatusSchema.safeParse({
      ...status,
      modelVisibilityContext: undefined,
    }).success,
  ).toBe(false);
  expect(
    LocalAgentStatusSchema.safeParse({
      status: 'login_required',
      message: 'Login',
      lastExecutionFailure: status.lastExecutionFailure,
    }).success,
  ).toBe(false);
});

it('accepts an Antigravity native connection without API credentials or arbitrary arguments', () => {
  const connection = {
    driver: 'antigravity',
    name: 'Antigravity (AGY)',
    executablePath: 'agy_acp_server',
    enabled: true,
    writeScopes: [],
  };
  expect(LocalAgentConnectionInputSchema.safeParse(connection).success).toBe(true);
  expect(
    LocalAgentClientCommandSchema.safeParse({
      action: 'probe_default',
      driver: 'antigravity',
    }).success,
  ).toBe(true);
  expect(
    LocalAgentConnectionInputSchema.safeParse({
      ...connection,
      apiKey: 'forbidden',
    }).success,
  ).toBe(false);
  expect(
    LocalAgentConnectionInputSchema.safeParse({
      ...connection,
      args: ['--unsafe'],
    }).success,
  ).toBe(false);
});

describe('read-only cached model directory contract', () => {
  it('allows only an existing owner-scoped connection ID without identity, token or executable', () => {
    expect(
      LocalAgentClientCommandSchema.parse({
        action: 'catalog_cached_connection',
        id: 'native-antigravity',
      }),
    ).toEqual({
      action: 'catalog_cached_connection',
      id: 'native-antigravity',
    });
    expect(
      LocalAgentClientCommandSchema.safeParse({
        action: 'catalog_cached_connection',
      }).success,
    ).toBe(false);
    for (const injected of [
      { identityId: 'other-profile' },
      { executablePath: 'fake' },
      { token: 'secret' },
      { modelId: 'injected' },
    ]) {
      expect(
        LocalAgentClientCommandSchema.safeParse({
          action: 'catalog_cached_connection',
          id: 'native-antigravity',
          ...injected,
        }).success,
      ).toBe(false);
    }
  });
});

describe('explicit Antigravity sign-in contracts', () => {
  it.each([
    'https://evil.example/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2F127.0.0.1%3A43179%2F&response_type=code&state=x',
    ...['code', 'access_token', 'refresh_token', 'id_token', 'token', 'error'].map(
      (parameter) =>
        `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2F127.0.0.1%3A43179%2F&response_type=code&state=x&${parameter}=private-value`,
    ),
  ])('rejects unsafe authorization URLs at the contract boundary: %s', (authorizationUrl) => {
    expect(
      LocalAgentAuthStateSchema.safeParse({
        phase: 'waiting',
        flowId: 'flow-1',
        authorizationUrl,
        expiresAt: 1,
        failure: null,
      }).success,
    ).toBe(false);
  });

  it('only exposes the authorization URL while waiting for Google', () => {
    const waiting = {
      phase: 'waiting',
      flowId: 'flow-1',
      authorizationUrl:
        'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=http%3A%2F%2F127.0.0.1%3A43179%2F&response_type=code&state=state-1',
      expiresAt: 1_800_000_000_000,
      failure: null,
    };
    expect(LocalAgentAuthStateSchema.parse(waiting)).toEqual(waiting);
    expect(
      LocalAgentAuthStateSchema.safeParse({
        ...waiting,
        phase: 'failed',
        failure: 'login_timeout',
      }).success,
    ).toBe(false);
    expect(
      LocalAgentAuthStateSchema.safeParse({
        ...waiting,
        phase: 'succeeded',
        failure: null,
      }).success,
    ).toBe(false);
    expect(
      LocalAgentAuthStateSchema.safeParse({
        ...waiting,
        failure: 'login_denied',
      }).success,
    ).toBe(true);
  });

  it('requires a connection and a bounded callback for the explicit login commands', () => {
    expect(
      LocalAgentClientCommandSchema.safeParse({
        action: 'auth_start',
        connectionId: 'agy-connection',
      }).success,
    ).toBe(true);
    expect(LocalAgentClientCommandSchema.safeParse({ action: 'auth_start' }).success).toBe(false);
    expect(
      LocalAgentClientCommandSchema.safeParse({
        action: 'auth_complete',
        connectionId: 'agy-connection',
        flowId: 'flow-1',
        callbackUrl: 'http://127.0.0.1:43179/?code=abc&state=state-1',
      }).success,
    ).toBe(true);
    expect(
      LocalAgentClientCommandSchema.safeParse({
        action: 'auth_complete',
        connectionId: 'agy-connection',
        flowId: 'flow-1',
        callbackUrl: 'x'.repeat(16_385),
      }).success,
    ).toBe(false);
    expect(
      LocalAgentClientCommandSchema.safeParse({
        action: 'auth_sign_out',
        connectionId: 'agy-connection',
      }).success,
    ).toBe(true);
  });
});
