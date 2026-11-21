import type { GatewayToolCheckpoint } from '../ports';
import { describe, expect, it, vi } from 'vitest';
import type { GatewayWriteAuthority } from '../ports';
import { GatewayPermissionDeniedError } from '../ports';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { createReadGateway } from './read-gateway';

const context = {
  requestId: 'request-a',
  traceId: 'trace-a',
  startedAt: Date.now(),
  source: 'http' as const,
};
function request(method: string, args = {}, name = 'goal_search', credential = 'Bearer private') {
  return new Request('https://api.memo.test/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': method,
      ...(method === 'tools/call' ? { 'Mcp-Name': name } : {}),
      authorization: credential,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        ...(method === 'tools/call' ? { name, arguments: args } : {}),
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'fixture', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
}
function fixture() {
  const authenticate = vi.fn().mockResolvedValue({
    identityId: 'owner-a',
    credentialId: 'pat-a',
    credentialType: 'pat',
    scopes: ['goals:read'],
  });
  const goals = {
    getGoal: vi.fn().mockResolvedValue(null),
    searchGoalPage: vi.fn().mockResolvedValue({ items: [], hasMore: false, next: null }),
  };
  const audit = vi.fn();
  const options = {
    consumeOwnerQuota: vi.fn().mockResolvedValue(true),
    enabled: true,
    toolCheckpoint: (async (_principal, _tool, work) => work()) satisfies GatewayToolCheckpoint,
    audience: 'https://api.memo.test/mcp',
    trustedOrigins: ['https://memo.test'],
    cursorSecret: 'test-only-secret-'.repeat(3),
    credentials: { authenticate, consumeReadQuota: vi.fn().mockResolvedValue(true) },
    goals,
    audit,
  };
  return { options, authenticate, goals, audit, gateway: createReadGateway(options) };
}
describe('Goal Gateway invocation boundary', () => {
  it('denies cached tool calls when disabled or revoked without reaching the owner', async () => {
    const f = fixture();
    expect(
      (
        await createReadGateway({ ...f.options, enabled: false }).fetch(
          request('tools/call'),
          context,
        )
      ).status,
    ).toBe(404);
    f.authenticate.mockResolvedValue(null);
    expect((await f.gateway.fetch(request('tools/call'), context)).status).toBe(401);
    expect(f.goals.searchGoalPage).not.toHaveBeenCalled();
  });
  it('enforces call-time scope and strict inputs, carrying canonical execution context', async () => {
    const f = fixture();
    const response = await f.gateway.fetch(
      request('tools/call', { query: '  hello  ', limit: 2 }),
      context,
    );
    expect(await response.json()).toMatchObject({
      result: { structuredContent: { items: [], hasMore: false, nextCursor: null } },
    });
    expect(f.goals.searchGoalPage).toHaveBeenCalledWith(
      { query: 'hello', limit: 2 },
      { ...context, identityId: 'owner-a' },
      expect.objectContaining({ deadlineAt: expect.any(Number), signal: expect.any(AbortSignal) }),
    );
    await f.gateway.fetch(request('tools/call', { identityId: 'owner-b' }), context);
    expect(f.goals.searchGoalPage).toHaveBeenCalledTimes(1);
    f.authenticate.mockResolvedValue({
      identityId: 'owner-a',
      credentialId: 'pat-a',
      credentialType: 'pat',
      scopes: [],
    });
    expect((await f.gateway.fetch(request('tools/call'), context)).status).toBe(403);
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain('Bearer private');
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain('hello');
  });
  it('denies untrusted Origin, altered cursors and oversized requests before owner queries', async () => {
    const f = fixture();
    const badOrigin = request('tools/list');
    badOrigin.headers.set('origin', 'https://evil.test');
    expect((await f.gateway.fetch(badOrigin, context)).status).toBe(403);
    const malformed = await f.gateway.fetch(request('tools/call', { cursor: 'tampered' }), context);
    expect(await malformed.json()).toMatchObject({ result: { isError: true } });
    const tooBig = request('tools/call', { query: 'x'.repeat(256 * 1024) });
    expect((await f.gateway.fetch(tooBig, context)).status).toBe(413);
    expect(f.goals.searchGoalPage).not.toHaveBeenCalled();
  });
  it('denies a grant revoked after admission and reports internal failures accurately', async () => {
    const f = fixture();
    f.authenticate
      .mockResolvedValueOnce({
        identityId: 'owner-a',
        credentialId: 'pat-a',
        credentialType: 'pat',
        scopes: ['goals:read'],
      })
      .mockResolvedValueOnce(null);
    const denied = await f.gateway.fetch(request('tools/call'), context);
    expect(await denied.json()).toMatchObject({
      result: { isError: true, content: [{ text: 'FORBIDDEN' }] },
    });
    expect(f.goals.searchGoalPage).not.toHaveBeenCalled();
    f.goals.searchGoalPage.mockRejectedValue(new Error('private database failure'));
    const failed = await f.gateway.fetch(request('tools/call'), context);
    expect(await failed.json()).toMatchObject({
      result: { isError: true, content: [{ text: 'INTERNAL_ERROR' }] },
    });
    expect(f.audit.mock.calls[f.audit.mock.calls.length - 1][0]).toMatchObject({
      outcome: 'INTERNAL_ERROR',
    });
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain('private database failure');
  });
  it('bounds authentication and reports retry timing before owner work', async () => {
    const f = fixture();
    f.options.credentials.consumeReadQuota.mockResolvedValue(false);
    const limited = await f.gateway.fetch(request('tools/list'), context);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(f.goals.searchGoalPage).not.toHaveBeenCalled();
    f.authenticate.mockImplementation(() => new Promise(() => {}));
    const timed = await createReadGateway({ ...f.options, timeoutMs: 5 }).fetch(
      request('tools/list'),
      { ...context, startedAt: Date.now() },
    );
    expect(timed.status).toBe(504);
    expect(f.audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'TIMEOUT' }));
  });
  it('bounds read deadlines and returns an explicit oversized result failure', async () => {
    const f = fixture();
    f.goals.searchGoalPage.mockImplementation(() => new Promise(() => {}));
    const timed = await createReadGateway({ ...f.options, timeoutMs: 5 }).fetch(
      request('tools/call'),
      { ...context, startedAt: Date.now() },
    );
    expect(timed.status).toBe(504);
    expect(await timed.json()).toMatchObject({ error: 'TIMEOUT' });
    expect(f.goals.searchGoalPage.mock.calls[0][2].signal.aborted).toBe(true);
    f.goals.getGoal.mockResolvedValue({
      id: 'IGoalId_00000000-0000-4000-8000-000000000000',
      name: 'Large Goal',
      summary: null,
      status: 'InProgress',
      version: 1,
      createdAt: 1,
      updatedAt: 1,
      overallProgress: 0,
      keyResults: Array.from({ length: 100 }, (_, i) => ({
        id: `IKeyResultId_00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        title: 'x'.repeat(3000),
        progress: {
          initialValue: 0,
          currentValue: 0,
          targetValue: 1,
          aggregationMethod: 'Last',
          unit: null,
        },
        progressPercentage: 0,
        isCompleted: false,
      })),
    });
    const large = await f.gateway.fetch(
      request('tools/call', { id: 'IGoalId_00000000-0000-4000-8000-000000000000' }, 'goal_get'),
      context,
    );
    expect(await large.json()).toMatchObject({
      result: { isError: true, content: [{ text: 'RESPONSE_TOO_LARGE' }] },
    });

    const largeGoal = await f.goals.getGoal.mock.results[0].value;
    f.goals.searchGoalPage.mockResolvedValue({
      items: [1, 2, 3].map((i) => ({
        ...largeGoal,
        id: `IGoalId_00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        keyResults: largeGoal.keyResults.slice(0, 50),
        createdAt: 4 - i,
      })),
      hasMore: false,
      next: null,
    });
    const reduced = await f.gateway.fetch(request('tools/call', { limit: 3 }), context);
    const reducedBody = await reduced.json();
    expect(reducedBody.result.structuredContent).toMatchObject({
      items: [expect.objectContaining({ createdAt: 3 })],
      hasMore: true,
      truncated: 'response-budget',
      nextCursor: expect.any(String),
    });
    expect(Buffer.byteLength(JSON.stringify(reducedBody))).toBeLessThan(256 * 1024);
  });
});

it('discovers six reads only for explicit owner scopes and denies a cached Task call', async () => {
  const f = fixture();
  const tasks = {
    getTaskPlan: vi.fn().mockResolvedValue(null),
    searchTaskPlans: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    getTaskOccurrence: vi.fn().mockResolvedValue(null),
    listTaskOccurrences: vi.fn().mockResolvedValue({ items: [], hasMore: false, timeZone: 'UTC' }),
  };
  const gateway = createReadGateway({ ...f.options, tasks });
  const listing = await gateway.fetch(request('tools/list'), context);
  expect((await listing.json()).result.tools.map((t: { name: string }) => t.name)).toEqual([
    'goal_get',
    'goal_search',
  ]);
  const denied = await gateway.fetch(
    request(
      'tools/call',
      { id: 'task-plan-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' },
      'task_plan_get',
    ),
    context,
  );
  expect(denied.status).toBe(403);
  expect(await denied.json()).toMatchObject({ error: 'INSUFFICIENT_SCOPE' });
  expect(tasks.getTaskPlan).not.toHaveBeenCalled();
  f.authenticate.mockResolvedValue({
    identityId: 'owner-a',
    credentialId: 'pat-a',
    credentialType: 'pat',
    scopes: ['goals:read', 'tasks:read'],
  });
  const all = await gateway.fetch(request('tools/list'), context);
  expect((await all.json()).result.tools.map((t: { name: string }) => t.name)).toEqual([
    'goal_get',
    'goal_search',
    'task_plan_get',
    'task_plan_search',
    'task_occurrence_get',
    'task_occurrence_list',
  ]);
});

it('discovers assisted lifecycle tools only when the independent assisted port is enabled', async () => {
  const f = fixture();
  const assisted = {
    start: vi.fn(),
    get: vi.fn(),
    review: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
  };
  f.authenticate.mockResolvedValue({
    identityId: 'owner-a',
    credentialId: 'pat-a',
    credentialType: 'pat',
    scopes: ['goals:read'],
  });
  const base = await f.gateway.fetch(request('tools/list'), context);
  expect((await base.json()).result.tools.map((tool: { name: string }) => tool.name)).not.toContain(
    'assisted_workflow_start',
  );
  f.authenticate.mockResolvedValue({
    identityId: 'owner-a',
    credentialId: 'pat-a',
    credentialType: 'pat',
    scopes: ['tasks:write'],
  });
  const enabled = createReadGateway({ ...f.options, assisted });
  const listing = await enabled.fetch(request('tools/list'), context);
  const listingBody = await listing.json();
  expect(listingBody, JSON.stringify(listingBody)).toHaveProperty('result.tools');
  expect(listingBody.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
    'assisted_workflow_start',
    'assisted_workflow_get',
    'assisted_workflow_review',
    'assisted_workflow_resume',
    'assisted_workflow_cancel',
  ]);
});

it('rechecks Task authority after discovery and rejects unknown tools and injected owner input', async () => {
  const f = fixture();
  const both = {
    identityId: 'owner-a',
    credentialId: 'pat-a',
    credentialType: 'pat',
    scopes: ['goals:read', 'tasks:read'],
  };
  const tasks = {
    getTaskPlan: vi.fn().mockResolvedValue(null),
    searchTaskPlans: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    getTaskOccurrence: vi.fn().mockResolvedValue(null),
    listTaskOccurrences: vi
      .fn()
      .mockResolvedValue({ items: [], hasMore: false, timeZone: 'UTC', asOf: Date.now() }),
  };
  const gateway = createReadGateway({ ...f.options, tasks });
  f.authenticate
    .mockResolvedValueOnce(both)
    .mockResolvedValueOnce({ ...both, scopes: ['goals:read'] });
  const denied = await gateway.fetch(
    request(
      'tools/call',
      { id: 'ITaskPlanId_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      'task_plan_get',
    ),
    context,
  );
  expect(await denied.json()).toMatchObject({
    result: { isError: true, content: [{ text: 'FORBIDDEN' }] },
  });
  expect(tasks.getTaskPlan).not.toHaveBeenCalled();
  f.authenticate.mockResolvedValue(both);
  const injected = await gateway.fetch(
    request('tools/call', { identityId: 'owner-b', limit: 1 }, 'task_plan_search'),
    context,
  );
  expect(await injected.json()).toMatchObject({ result: { isError: true } });
  expect(f.audit).toHaveBeenLastCalledWith(
    expect.objectContaining({ tool: 'task_plan_search', outcome: 'INVALID_INPUT' }),
  );
  expect(tasks.searchTaskPlans).not.toHaveBeenCalled();
  const unknown = await gateway.fetch(request('tools/call', {}, 'task_complete'), context);
  expect((await unknown.json()).error).toBeDefined();
  const invalidRange = await gateway.fetch(
    request('tools/call', { startDate: 100, endDate: 0 }, 'task_occurrence_list'),
    context,
  );
  expect(await invalidRange.json()).toMatchObject({ result: { isError: true } });
  const invalidInstant = await gateway.fetch(
    request(
      'tools/call',
      {
        startDate: Number.MAX_SAFE_INTEGER,
        endDate: Number.MAX_SAFE_INTEGER,
      },
      'task_occurrence_list',
    ),
    context,
  );
  expect(await invalidInstant.json()).toMatchObject({ result: { isError: true } });
  expect(tasks.listTaskOccurrences).not.toHaveBeenCalled();
});

it('preserves unknown causes for the private observer and returns only a safe public code', async () => {
  const f = fixture();
  const cause = new Error('private provider detail');
  f.goals.searchGoalPage.mockRejectedValue(cause);
  const diagnose = vi.fn();
  const response = await createReadGateway({ ...f.options, diagnose }).fetch(
    request('tools/call'),
    { ...context, startedAt: Date.now() },
  );
  const body = await response.text();
  expect(body).toContain('INTERNAL_ERROR');
  expect(body).not.toContain(cause.message);
  expect(diagnose).toHaveBeenCalledWith({
    requestId: context.requestId,
    traceId: context.traceId,
    cause,
  });
  expect(f.audit.mock.calls[0][0]).not.toHaveProperty('cause');
});

describe('AI hosted read capability', () => {
  const summary = {
    id: 'conversation-1',
    title: 'Weekly review',
    status: 'Active' as const,
    messageCount: 1,
    createdAt: 1,
    updatedAt: 2,
  };
  const transcript = {
    conversationId: 'conversation-1',
    messages: [
      {
        id: 'message-1',
        role: 'user' as const,
        content: 'x'.repeat(2_000),
        truncated: true,
        attachments: [{ filename: 'shot.png', mediaType: 'image/png', sizeBytes: 10 }],
        createdAt: 1,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 10,
    hasMore: false,
  };
  const agent = {
    instanceId: 'instance-1',
    driver: 'mastra' as const,
    name: 'Archive entry',
    enabled: true,
    createdAt: 1,
    updatedAt: 2,
  };
  function aiFixture() {
    const f = fixture();
    f.authenticate.mockResolvedValue({
      identityId: 'owner-a',
      credentialId: 'pat-a',
      credentialType: 'pat',
      scopes: ['ai:read'],
    });
    const conversations = {
      listConversations: vi.fn().mockResolvedValue({
        ok: true,
        data: { conversations: [summary], total: 1, page: 1, pageSize: 20 },
      }),
      readConversation: vi.fn(async (_cx: ExecutionContext, id: string) =>
        id === 'conversation-1'
          ? { ok: true, data: transcript }
          : { ok: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } },
      ),
    };
    const agents = {
      list: vi.fn().mockResolvedValue(
        Array.from({ length: 60 }, (_, index) => ({
          ...agent,
          instanceId: `instance-${index}`,
        })),
      ),
      get: vi.fn(async (instanceId: string) => (instanceId === agent.instanceId ? agent : null)),
    };
    return {
      ...f,
      conversations,
      agents,
      gateway: createReadGateway({ ...f.options, assistantConversation: conversations, agents }),
    };
  }

  it('discovers the five AI reads only for ai:read and never for another read scope', async () => {
    const f = aiFixture();
    const listing = await f.gateway.fetch(request('tools/list'), context);
    expect((await listing.json()).result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'ai_conversation_list',
      'ai_conversation_get',
      'ai_conversation_transcript',
      'ai_agent_list',
      'ai_agent_get',
    ]);

    f.authenticate.mockResolvedValue({
      identityId: 'owner-a',
      credentialId: 'pat-a',
      credentialType: 'pat',
      scopes: ['goals:read'],
    });
    const denied = await f.gateway.fetch(
      request('tools/call', { id: 'conversation-1' }, 'ai_conversation_get'),
      context,
    );
    expect(denied.status).toBe(403);
    expect(f.conversations.readConversation).not.toHaveBeenCalled();
  });

  it('serves metadata-only lists and answers NOT_FOUND for foreign or missing ids', async () => {
    const f = aiFixture();
    const listed = await f.gateway.fetch(
      request('tools/call', {}, 'ai_conversation_list'),
      context,
    );
    const listedBody = await listed.json();
    expect(listedBody).toMatchObject({
      result: { structuredContent: { conversations: [summary], total: 1 } },
    });
    expect(JSON.stringify(listedBody)).not.toContain('messages');

    for (const id of ['conversation-2', 'missing']) {
      const transcript = await f.gateway.fetch(
        request('tools/call', { id }, 'ai_conversation_transcript'),
        context,
      );
      expect(await transcript.json()).toMatchObject({
        result: { isError: true, content: [{ text: 'NOT_FOUND' }] },
      });
    }

    const foreignAgent = await f.gateway.fetch(
      request('tools/call', { instanceId: 'instance-other' }, 'ai_agent_get'),
      context,
    );
    expect(await foreignAgent.json()).toMatchObject({
      result: { isError: true, content: [{ text: 'NOT_FOUND' }] },
    });
    expect(f.agents.get).toHaveBeenCalledWith(
      'instance-other',
      expect.objectContaining({ identityId: 'owner-a' }),
    );
  });

  it('keeps the transcript truncation flag and caps archive and transcript pages', async () => {
    const f = aiFixture();
    const transcript = await f.gateway.fetch(
      request('tools/call', { id: 'conversation-1' }, 'ai_conversation_get'),
      context,
    );
    expect(await transcript.json()).toMatchObject({
      result: { structuredContent: { messages: [{ truncated: true }] } },
    });

    const oversized = await f.gateway.fetch(
      request('tools/call', { id: 'conversation-1', pageSize: 999 }, 'ai_conversation_transcript'),
      context,
    );
    expect(await oversized.json()).toMatchObject({ result: { isError: true } });
    expect(f.conversations.readConversation).toHaveBeenCalledTimes(1);

    const agents = await f.gateway.fetch(request('tools/call', {}, 'ai_agent_list'), context);
    const body = await agents.json();
    expect(body.result.structuredContent.agents).toHaveLength(50);
    expect(body.result.structuredContent.truncated).toBe('archive-limit');
  });

  it('returns 404 when the AI host ports are absent and surfaces checkpoint denials', async () => {
    const f = aiFixture();
    const disabled = createReadGateway({ ...f.options });
    expect(
      (
        await disabled.fetch(
          request('tools/call', { id: 'conversation-1' }, 'ai_conversation_get'),
          context,
        )
      ).status,
    ).toBe(404);

    const denied = createReadGateway({
      ...f.options,
      assistantConversation: f.conversations,
      agents: f.agents,
      toolCheckpoint: (async () => {
        throw new GatewayPermissionDeniedError('deny');
      }) satisfies GatewayToolCheckpoint,
    });
    const response = await denied.fetch(request('tools/call', {}, 'ai_conversation_list'), context);
    const body = await response.text();
    expect(body).toContain('PERMISSION_DENIED');
    expect(body).toContain('AI Permissions');
  });
});

describe('Routine hosted write capability', () => {
  function routineFixture(
    enabled = true,
    type: 'pat' | 'oauth' = 'pat',
    scopes = ['routines:write'],
    oauthWrites = false,
  ) {
    const f = fixture();
    f.authenticate.mockResolvedValue({
      identityId: 'owner-a',
      credentialId: 'pat-a',
      credentialType: type,
      scopes,
    });
    const receipt = {
      receiptId: 'a'.repeat(64),
      result: {
        routine: { id: '5b5d8a2b-9934-4be8-8e07-3f62ed122e15', version: 1, name: 'Review' },
        scheduledFor: 1792458000000,
      },
      replayed: false,
    };
    const routineCreate = vi.fn(
      async (_input: unknown, _cx: ExecutionContext, authority: GatewayWriteAuthority) => {
        await authority.authorize();
        return receipt;
      },
    );
    const routineUpdate = vi.fn(
      async (_input: unknown, _cx: ExecutionContext, authority: GatewayWriteAuthority) => {
        await authority.authorize();
        return { receiptId: 'b'.repeat(64), result: { routine: receipt.result.routine } };
      },
    );
    const routineDelete = vi.fn(
      async (_input: unknown, _cx: ExecutionContext, authority: GatewayWriteAuthority) => {
        await authority.authorize();
        return {
          receiptId: 'c'.repeat(64),
          result: { routineId: receipt.result.routine.id },
        };
      },
    );
    const routinePause = vi.fn(
      async (_input: unknown, _cx: ExecutionContext, authority: GatewayWriteAuthority) => {
        await authority.authorize();
        return {
          receiptId: 'd'.repeat(64),
          result: { routineId: receipt.result.routine.id, override: null },
        };
      },
    );
    const routineOverride = vi.fn(
      async (_input: unknown, _cx: ExecutionContext, authority: GatewayWriteAuthority) => {
        await authority.authorize();
        return {
          receiptId: 'e'.repeat(64),
          result: { routineId: receipt.result.routine.id, override: null },
        };
      },
    );
    const unavailable = vi.fn().mockRejectedValue(new Error('Unexpected owner'));
    const writes = {
      goalCreate: unavailable,
      goalUpdate: unavailable,
      keyResultCreate: unavailable,
      keyResultUpdate: unavailable,
      taskCreate: unavailable,
      taskUpdate: unavailable,
      taskComplete: unavailable,
      ...(enabled
        ? { routineCreate, routineUpdate, routineDelete, routinePause, routineOverride }
        : {}),
    };
    return {
      ...f,
      routineCreate,
      routineUpdate,
      routineDelete,
      routinePause,
      routineOverride,
      gateway: createReadGateway({ ...f.options, oauthWrites, writes }),
    };
  }
  const input = {
    idempotencyKey: 'once',
    name: 'Review',
    trigger: {
      type: 'WallClock',
      localTime: '09:00',
      timeZone: 'Asia/Shanghai',
      startDate: '2026-10-20',
    },
  };
  it('discovers the routine write set with a routine-only PAT, and keeps the separate gate off', async () => {
    const f = routineFixture();
    expect(
      (await (await f.gateway.fetch(request('tools/list'), context)).json()).result.tools.map(
        (t) => t.name,
      ),
    ).toEqual([
      'routine_create',
      'routine_update',
      'routine_delete',
      'routine_pause',
      'routine_override',
    ]);
    const off = routineFixture(false);
    expect(
      (await (await off.gateway.fetch(request('tools/list'), context)).json()).result.tools,
    ).toEqual([]);
    expect(
      (await off.gateway.fetch(request('tools/call', input, 'routine_create'), context)).status,
    ).toBe(404);
    expect(off.routineCreate).not.toHaveBeenCalled();
    for (const scopes of [['goals:write'], ['tasks:read']]) {
      const other = routineFixture(true, 'pat', scopes);
      expect(
        (await (await other.gateway.fetch(request('tools/list'), context)).json()).result.tools.map(
          (t) => t.name,
        ),
      ).not.toContain('routine_create');
      expect(
        (await other.gateway.fetch(request('tools/call', input, 'routine_create'), context)).status,
      ).toBe(403);
    }
  });
  it('keeps OAuth writes hidden while the switch is off and publishes them when it is on', async () => {
    const f = routineFixture(true, 'oauth', ['routines:write', 'goals:read']);
    expect(
      (await (await f.gateway.fetch(request('tools/list'), context)).json()).result.tools.map(
        (t) => t.name,
      ),
    ).not.toContain('routine_create');
    expect(
      (await f.gateway.fetch(request('tools/call', input, 'routine_create'), context)).status,
    ).toBe(404);
    expect(f.routineCreate).not.toHaveBeenCalled();
    const enabled = routineFixture(true, 'oauth', ['routines:write', 'goals:read'], true);
    expect(
      (await (await enabled.gateway.fetch(request('tools/list'), context)).json()).result.tools.map(
        (t) => t.name,
      ),
    ).toContain('routine_create');
    expect(
      (await enabled.gateway.fetch(request('tools/call', input, 'routine_create'), context)).status,
    ).toBe(200);
    expect(enabled.routineCreate).toHaveBeenCalledTimes(1);
  });
  it('revalidates authority, passes verified identity, and audits without private payloads', async () => {
    const f = routineFixture();
    expect(
      (
        await (
          await f.gateway.fetch(request('tools/call', input, 'routine_create'), context)
        ).json()
      ).result.structuredContent.replayed,
    ).toBe(false);
    expect(f.routineCreate).toHaveBeenCalledWith(
      input,
      expect.objectContaining({ identityId: 'owner-a' }),
      expect.objectContaining({ connectionId: 'pat-a' }),
    );
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'routine_create',
        effect: 'write',
        scopeDecision: 'allowed',
        receiptId: 'a'.repeat(64),
        replayed: false,
        outcome: 'OK',
      }),
    );
    expect(JSON.stringify(f.audit.mock.calls)).not.toMatch(/Review|Asia\/Shanghai|private/);
    f.authenticate
      .mockResolvedValueOnce({
        identityId: 'owner-a',
        credentialId: 'pat-a',
        credentialType: 'pat',
        scopes: ['routines:write'],
      })
      .mockResolvedValueOnce(null);
    expect(
      await (await f.gateway.fetch(request('tools/call', input, 'routine_create'), context)).json(),
    ).toMatchObject({ result: { isError: true, content: [{ text: 'FORBIDDEN' }] } });
    expect(f.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ scopeDecision: 'denied', outcome: 'FORBIDDEN' }),
    );
  });

  it('exposes relation_neighbors only with relations:read scope, validates inputs, and verifies cursor roundtrip', async () => {
    const authenticate = vi.fn().mockResolvedValue({
      identityId: 'owner-a',
      credentialId: 'pat-a',
      credentialType: 'pat',
      scopes: ['relations:read'],
    });
    const relations = {
      getNeighbors: vi.fn().mockResolvedValue({
        items: [
          {
            relationId: 'rel-1',
            relationType: 'related',
            direction: 'outgoing',
            targetNode: { type: 'knowledge', id: 'doc-1' },
            createdAt: 1000,
          },
          {
            relationId: 'rel-2',
            relationType: 'depends_on',
            direction: 'incoming',
            targetNode: { type: 'task', id: 'task-1' },
            createdAt: 2000,
          },
        ],
        hasMore: true,
      }),
    };
    const audit = vi.fn();
    const options = {
      consumeOwnerQuota: vi.fn().mockResolvedValue(true),
      enabled: true,
      toolCheckpoint: (async (_principal, _tool, work) => work()) satisfies GatewayToolCheckpoint,
      audience: 'https://api.memo.test/mcp',
      trustedOrigins: ['https://memo.test'],
      cursorSecret: 'test-only-secret-'.repeat(3),
      credentials: { authenticate, consumeReadQuota: vi.fn().mockResolvedValue(true) },
      goals: {
        getGoal: vi.fn().mockResolvedValue(null),
        searchGoalPage: vi.fn().mockResolvedValue({ items: [], hasMore: false, next: null }),
      },
      relations,
      audit,
    };
    const gateway = createReadGateway(options);

    // tools/list includes relation_neighbors
    const listRes = await gateway.fetch(request('tools/list'), context);
    const tools = (await listRes.json()).result.tools.map((t: { name: string }) => t.name);
    expect(tools).toContain('relation_neighbors');

    // Call relation_neighbors
    const callInput = {
      node: { type: 'goal', id: 'goal-1' },
      relationType: 'related',
      limit: 2,
    };
    const callRes = await gateway.fetch(
      request('tools/call', callInput, 'relation_neighbors'),
      context,
    );
    expect(callRes.status).toBe(200);
    const callBody = await callRes.json();
    expect(callBody.result.structuredContent).toMatchObject({
      items: [
        {
          relationId: 'rel-1',
          relationType: 'related',
          direction: 'outgoing',
          targetNode: { type: 'knowledge', id: 'doc-1' },
          createdAt: 1000,
        },
        {
          relationId: 'rel-2',
          relationType: 'depends_on',
          direction: 'incoming',
          targetNode: { type: 'task', id: 'task-1' },
          createdAt: 2000,
        },
      ],
      hasMore: true,
      nextCursor: expect.any(String),
    });
    expect(relations.getNeighbors).toHaveBeenCalledWith(
      expect.objectContaining({
        node: { type: 'goal', id: 'goal-1' },
        relationType: 'related',
        limit: 2,
        offset: 0,
      }),
      expect.objectContaining({ identityId: 'owner-a' }),
      expect.any(Object),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'relation_neighbors',
        effect: 'read',
        scopeDecision: 'allowed',
        outcome: 'OK',
      }),
    );

    // Call with the returned nextCursor
    const nextCursor = callBody.result.structuredContent.nextCursor;
    relations.getNeighbors.mockResolvedValueOnce({
      items: [],
      hasMore: false,
    });
    const page2Res = await gateway.fetch(
      request(
        'tools/call',
        {
          ...callInput,
          cursor: nextCursor,
        },
        'relation_neighbors',
      ),
      context,
    );
    expect(page2Res.status).toBe(200);
    expect(relations.getNeighbors).toHaveBeenLastCalledWith(
      expect.objectContaining({
        offset: 2,
      }),
      expect.anything(),
      expect.anything(),
    );

    // Denies when scope is lacking
    authenticate.mockResolvedValueOnce({
      identityId: 'owner-a',
      credentialId: 'pat-a',
      credentialType: 'pat',
      scopes: ['goals:read'],
    });
    const deniedRes = await gateway.fetch(
      request('tools/call', callInput, 'relation_neighbors'),
      context,
    );
    expect(deniedRes.status).toBe(403);
  });
});

describe('Notification and Schedule read capability', () => {
  const notification = {
    id: 'notif-1',
    workflowKey: 'flow-1',
    topic: 'routine',
    title: 'Daily Review',
    content: 'Time for daily review',
    contentTruncated: false,
    type: 'Reminder',
    category: 'Reminder',
    importance: 'Moderate',
    urgency: 'Medium',
    isRead: false,
    readAt: null,
    archivedAt: null,
    createdAt: 1792454400000,
    updatedAt: 1792454400000,
    version: 1,
    relatedEntityType: null,
    relatedEntityId: null,
  };
  const schedule = {
    id: 'sched-1',
    title: 'Team Sync',
    description: 'Weekly team sync',
    range: { kind: 'Timed', start: 1792458000000, end: 1792461600000 },
    version: 1,
    createdAt: 1792454400000,
    updatedAt: 1792454400000,
  };
  function domainFixture(scopes = ['notifications:read', 'schedules:read'], bind = true) {
    const f = fixture();
    f.authenticate.mockResolvedValue({
      identityId: 'owner-a',
      credentialId: 'pat-a',
      credentialType: 'pat',
      scopes,
    });
    const notifications = {
      getNotification: vi.fn().mockResolvedValue(notification),
      listNotifications: vi.fn().mockResolvedValue({
        items: [notification],
        total: 1,
        page: 1,
        pageSize: 20,
        hasMore: false,
      }),
      getUnreadCount: vi.fn().mockResolvedValue(1),
    };
    const schedules = {
      getSchedule: vi.fn().mockResolvedValue(schedule),
      listSchedules: vi.fn().mockResolvedValue({ items: [schedule], hasMore: false }),
    };
    return {
      ...f,
      notifications,
      schedules,
      gateway: createReadGateway({
        ...f.options,
        ...(bind ? { notifications, schedules } : {}),
      }),
    };
  }
  it('allows the new read scopes and denies a PAT without them', async () => {
    const allowed = domainFixture();
    const notificationBody = await (
      await allowed.gateway.fetch(
        request('tools/call', { id: 'notif-1' }, 'notification_get'),
        context,
      )
    ).json();
    expect(notificationBody.result.structuredContent.notification.id).toBe('notif-1');
    const scheduleBody = await (
      await allowed.gateway.fetch(
        request(
          'tools/call',
          { startTime: 1792454400000, endTime: 1792454400000 + 86400000, limit: 10 },
          'schedule_list',
        ),
        context,
      )
    ).json();
    expect(scheduleBody.result.structuredContent.items).toHaveLength(1);

    const denied = domainFixture(['notifications:read']);
    const deniedCall = await denied.gateway.fetch(
      request(
        'tools/call',
        { startTime: 1792454400000, endTime: 1792454400000 + 86400000, limit: 10 },
        'schedule_list',
      ),
      context,
    );
    expect(deniedCall.status).toBe(403);
    expect(await deniedCall.json()).toMatchObject({ error: 'INSUFFICIENT_SCOPE' });
    expect(denied.schedules.listSchedules).not.toHaveBeenCalled();
    const listing = await (await denied.gateway.fetch(request('tools/list'), context)).json();
    expect(listing.result.tools.map((tool: { name: string }) => tool.name)).not.toContain(
      'schedule_list',
    );
    expect(listing.result.tools.map((tool: { name: string }) => tool.name)).toContain(
      'notification_get',
    );
  });
  it('hides the tools when the host does not bind the owner port', async () => {
    const unbound = domainFixture();
    const gateway = createReadGateway({ ...unbound.options });
    expect(
      (await gateway.fetch(request('tools/call', { id: 'notif-1' }, 'notification_get'), context))
        .status,
    ).toBe(404);
    expect(unbound.notifications.getNotification).not.toHaveBeenCalled();
  });
});

describe('Routine hosted reads', () => {
  const routineId = '5b5d8a2b-9934-4be8-8e07-3f62ed122e15';
  function definition(id: string, name: string, createdAt: string) {
    return {
      id,
      name,
      description: null,
      enabled: true,
      trigger: null,
      version: 1,
      createdAt,
      updatedAt: createdAt,
    };
  }
  function readFixture(scopes = ['routines:read'], routines = true) {
    const f = fixture();
    f.authenticate.mockResolvedValue({
      identityId: 'owner-a',
      credentialId: 'pat-a',
      credentialType: 'pat',
      scopes,
    });
    const definitions = [
      definition(routineId, 'Review', '2026-11-16T00:00:00.000Z'),
      definition('6c6e9b3c-aa45-4cf9-9f18-4a73fe233f26', 'Stretch', '2026-11-15T00:00:00.000Z'),
    ];
    const port = {
      getConfigurationSnapshot: vi.fn().mockResolvedValue({
        definitions,
        profiles: [],
        memberships: [],
        preferences: { globalEnabled: true, version: 1 },
        runtimeContext: { activeProfileIds: [] },
        capabilities: { localRuntime: false },
        overrides: [],
      }),
      getUpcomingOccurrences: vi.fn().mockResolvedValue({
        occurrences: [
          {
            identityId: 'owner-a',
            routineId,
            occurrenceKey: 'routine:1:0',
            title: 'Review',
            description: null,
            occurrenceAt: 1792458000000,
            endAt: null,
            revision: 1,
            editable: false,
          },
        ],
      }),
    };
    return {
      ...f,
      routines: port,
      gateway: createReadGateway({ ...f.options, ...(routines ? { routines: port } : {}) }),
    };
  }

  it('pages owned definitions with a bound and a signed cursor', async () => {
    const f = readFixture();
    const first = await f.gateway.fetch(
      request('tools/call', { query: 're', limit: 1 }, 'routine_list'),
      context,
    );
    const body = await first.json();
    expect(body.result.structuredContent.items.map((item: { id: string }) => item.id)).toEqual([
      routineId,
    ]);
    expect(body.result.structuredContent.hasMore).toBe(true);
    const cursor = body.result.structuredContent.nextCursor;
    expect(typeof cursor).toBe('string');
    const second = await f.gateway.fetch(
      request('tools/call', { query: 're', limit: 1, cursor }, 'routine_list'),
      context,
    );
    expect(
      (await second.json()).result.structuredContent.items.map(
        (item: { name: string }) => item.name,
      ),
    ).toEqual(['Stretch']);
    const tampered = await f.gateway.fetch(
      request('tools/call', { query: 're', limit: 1, cursor: 'tampered' }, 'routine_list'),
      context,
    );
    expect(await tampered.json()).toMatchObject({ result: { isError: true } });
  });

  it('bounds the upcoming window and omits owner identity', async () => {
    const f = readFixture();
    const response = await f.gateway.fetch(
      request(
        'tools/call',
        { start: 1_000, end: 1_000 + 31 * 86400000, limit: 5 },
        'routine_upcoming',
      ),
      context,
    );
    const occurrence = (await response.json()).result.structuredContent.items[0];
    expect(occurrence).toMatchObject({ routineId, occurrenceKey: 'routine:1:0' });
    expect(occurrence).not.toHaveProperty('identityId');
    expect(f.routines.getUpcomingOccurrences).toHaveBeenCalledWith(
      'owner-a',
      { start: 1_000, end: 1_000 + 31 * 86400000, includeElapsed: false, limit: 6 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const tooWide = await f.gateway.fetch(
      request('tools/call', { start: 1_000, end: 1_000 + 32 * 86400000 }, 'routine_upcoming'),
      context,
    );
    expect(await tooWide.json()).toMatchObject({ result: { isError: true } });
    expect(f.routines.getUpcomingOccurrences).toHaveBeenCalledTimes(1);
  });

  it('reports a missing routine and hides the tools without a bound port or scope', async () => {
    const f = readFixture();
    const missing = await f.gateway.fetch(
      request('tools/call', { id: '7d7f0c4d-bb56-4dfa-a029-5b84ff344037' }, 'routine_get'),
      context,
    );
    expect(await missing.json()).toMatchObject({ result: { isError: true } });
    const noPort = readFixture(['routines:read'], false);
    expect(
      (await noPort.gateway.fetch(request('tools/call', { id: routineId }, 'routine_get'), context))
        .status,
    ).toBe(404);
    const noScope = readFixture(['tasks:read']);
    expect(
      (await (await noScope.gateway.fetch(request('tools/list'), context)).json()).result.tools.map(
        (tool: { name: string }) => tool.name,
      ),
    ).not.toContain('routine_get');
  });
});
describe('Notification hosted read and mark-read capability', () => {
  const fact = {
    id: 'notification-1',
    workflowKey: 'goal.reminder',
    topic: 'goal',
    title: 'Goal reminder',
    content: 'Review the goal',
    contentTruncated: false,
    type: 'Reminder',
    category: 'Goal',
    importance: 'Moderate',
    urgency: 'Medium',
    isRead: false,
    readAt: null,
    archivedAt: null,
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    relatedEntityType: null,
    relatedEntityId: null,
  } as const;
  function notificationFixture(
    scopes: string[] = ['notifications:read', 'notifications:write'],
    credentialType: 'pat' | 'oauth' = 'pat',
    oauthWrites = false,
  ) {
    const f = fixture();
    f.authenticate.mockResolvedValue({
      identityId: 'owner-a',
      credentialId: 'pat-a',
      credentialType,
      scopes,
    });
    const listNotifications = vi.fn().mockResolvedValue({
      items: [fact],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });
    const getUnreadCount = vi.fn().mockResolvedValue(3);
    const getNotification = vi.fn().mockResolvedValue(fact);
    const markAsRead = vi.fn(
      async (_input: unknown, _cx: ExecutionContext, authority: GatewayWriteAuthority) => {
        await authority.authorize();
        return { id: fact.id, isRead: true, readAt: 5, version: 2, updatedAt: 6 };
      },
    );
    const unavailable = vi.fn().mockRejectedValue(new Error('Unexpected owner'));
    const writes = {
      goalCreate: unavailable,
      goalUpdate: unavailable,
      keyResultCreate: unavailable,
      keyResultUpdate: unavailable,
      taskCreate: unavailable,
      taskUpdate: unavailable,
      taskComplete: unavailable,
      notificationMarkRead: markAsRead,
    };
    return {
      ...f,
      listNotifications,
      getUnreadCount,
      getNotification,
      markAsRead,
      gateway: createReadGateway({
        ...f.options,
        oauthWrites,
        notifications: { listNotifications, getUnreadCount, getNotification },
        writes,
      }),
    };
  }
  const names = async (gateway: ReturnType<typeof createReadGateway>) =>
    (await (await gateway.fetch(request('tools/list'), context)).json()).result.tools.map(
      (tool: { name: string }) => tool.name,
    );
  it('publishes only the notification tools the credential scopes allow', async () => {
    const reads = notificationFixture(['notifications:read']);
    expect(await names(reads.gateway)).toEqual([
      'notification_get',
      'notification_list',
      'notification_unread_count',
    ]);
    const writes = notificationFixture(['notifications:write']);
    expect(await names(writes.gateway)).toEqual(['notification_mark_read']);
    const goalsOnly = notificationFixture(['goals:read']);
    expect(await names(goalsOnly.gateway)).not.toContain('notification_list');
    const oauth = notificationFixture(['notifications:read', 'notifications:write'], 'oauth');
    expect(await names(oauth.gateway)).toEqual([
      'notification_get',
      'notification_list',
      'notification_unread_count',
    ]);
    const oauthWrites = notificationFixture(
      ['notifications:read', 'notifications:write'],
      'oauth',
      true,
    );
    expect(await names(oauthWrites.gateway)).toEqual([
      'notification_get',
      'notification_list',
      'notification_unread_count',
      'notification_mark_read',
    ]);
  });
  it('bounds page and limit, rejects injected identity and projects the owner whitelist', async () => {
    const f = notificationFixture();
    for (const args of [{ limit: 51 }, { page: 21 }, { limit: 0 }, { identityId: 'owner-b' }]) {
      expect(
        await (
          await f.gateway.fetch(request('tools/call', args, 'notification_list'), context)
        ).json(),
      ).toMatchObject({ result: { isError: true } });
    }
    expect(f.listNotifications).not.toHaveBeenCalled();
    const listed = await f.gateway.fetch(request('tools/call', {}, 'notification_list'), context);
    expect(await listed.json()).toMatchObject({
      result: {
        structuredContent: {
          items: [{ id: 'notification-1', contentTruncated: false }],
          total: 1,
          page: 1,
          pageSize: 20,
          hasMore: false,
        },
      },
    });
    expect(f.listNotifications).toHaveBeenCalledWith(
      { archiveState: 'active', page: 1, limit: 20 },
      expect.objectContaining({ identityId: 'owner-a' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain('Review the goal');
  });
  it('counts unread notifications for the credential owner only', async () => {
    const f = notificationFixture();
    const counted = await f.gateway.fetch(
      request('tools/call', {}, 'notification_unread_count'),
      context,
    );
    expect(await counted.json()).toMatchObject({ result: { structuredContent: { count: 3 } } });
    expect(f.getUnreadCount).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'owner-a' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it('marks read under the write authority and audits the write without payloads', async () => {
    const f = notificationFixture();
    const marked = await f.gateway.fetch(
      request('tools/call', { id: fact.id }, 'notification_mark_read'),
      context,
    );
    expect(await marked.json()).toMatchObject({
      result: { structuredContent: { id: fact.id, isRead: true, version: 2 } },
    });
    expect(f.markAsRead).toHaveBeenCalledWith(
      { id: fact.id },
      expect.objectContaining({ identityId: 'owner-a' }),
      expect.objectContaining({ connectionId: 'pat-a' }),
    );
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'notification_mark_read',
        effect: 'write',
        scopeDecision: 'allowed',
        outcome: 'OK',
      }),
    );
    f.authenticate
      .mockResolvedValueOnce({
        identityId: 'owner-a',
        credentialId: 'pat-a',
        credentialType: 'pat',
        scopes: ['notifications:write'],
      })
      .mockResolvedValueOnce(null);
    expect(
      await (
        await f.gateway.fetch(
          request('tools/call', { id: fact.id }, 'notification_mark_read'),
          context,
        )
      ).json(),
    ).toMatchObject({ result: { isError: true, content: [{ text: 'FORBIDDEN' }] } });
  });
  it('denies mark-read for a read-only PAT and for OAuth while the write switch is off', async () => {
    const readOnly = notificationFixture(['notifications:read']);
    expect(
      (
        await readOnly.gateway.fetch(
          request('tools/call', { id: fact.id }, 'notification_mark_read'),
          context,
        )
      ).status,
    ).toBe(403);
    expect(readOnly.markAsRead).not.toHaveBeenCalled();
    const oauth = notificationFixture(['notifications:write', 'notifications:read'], 'oauth');
    expect(
      (
        await oauth.gateway.fetch(
          request('tools/call', { id: fact.id }, 'notification_mark_read'),
          context,
        )
      ).status,
    ).toBe(404);
    expect(oauth.markAsRead).not.toHaveBeenCalled();
    const enabled = notificationFixture(
      ['notifications:write', 'notifications:read'],
      'oauth',
      true,
    );
    expect(
      (
        await enabled.gateway.fetch(
          request('tools/call', { id: fact.id }, 'notification_mark_read'),
          context,
        )
      ).status,
    ).toBe(200);
    expect(enabled.markAsRead).toHaveBeenCalledTimes(1);
  });
});

describe('Label read tools (#993)', () => {
  function labelFixture(enabled = true, scopes = ['labels:read']) {
    const f = fixture();
    f.authenticate.mockResolvedValue({
      identityId: 'owner-a',
      credentialId: 'pat-a',
      credentialType: 'pat',
      scopes,
    });
    const labelA = {
      id: 'label-1',
      name: 'Work',
      color: '#ff0000' as const,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const labelB = {
      id: 'label-2',
      name: 'Personal',
      color: null,
      createdAt: 1001,
      updatedAt: 1001,
    };
    const labels = {
      list: vi.fn(async (input: { search?: string; limit?: number }) => {
        if (input.search === 'empty') return [];
        return [labelA, labelB];
      }),
      resolveNames: vi.fn(async (names: readonly string[]) => {
        if (names.length === 0) return [];
        return [labelA];
      }),
    };
    return {
      ...f,
      labels,
      gateway: createReadGateway({
        ...f.options,
        labels: enabled ? labels : undefined,
      }),
    };
  }

  it('lists registered tools only when labels:read is in PAT scopes', async () => {
    const enabled = labelFixture();
    const res = await enabled.gateway.fetch(request('tools/list'), context);
    const listed = await res.json();
    const toolNames = listed.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('label_list');
    expect(toolNames).toContain('label_resolve_names');

    const withoutScope = labelFixture(true, ['goals:read']);
    const notListed = await (
      await withoutScope.gateway.fetch(request('tools/list'), context)
    ).json();
    const notListedNames = notListed.result.tools.map((t: { name: string }) => t.name);
    expect(notListedNames).not.toContain('label_list');
    expect(notListedNames).not.toContain('label_resolve_names');
  });

  it('calls label_list and returns populated or empty results within bounded contract', async () => {
    const f = labelFixture();
    const normalRes = await (
      await f.gateway.fetch(
        request('tools/call', { limit: 10, search: 'work' }, 'label_list'),
        context,
      )
    ).json();
    expect(normalRes.result.structuredContent.items).toHaveLength(2);
    expect(normalRes.result.structuredContent.items[0]).toEqual({
      id: 'label-1',
      name: 'Work',
      color: '#ff0000',
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(f.labels.list).toHaveBeenCalledWith(
      { limit: 10, search: 'work' },
      expect.objectContaining({ identityId: 'owner-a' }),
      expect.anything(),
    );

    const emptyRes = await (
      await f.gateway.fetch(request('tools/call', { search: 'empty' }, 'label_list'), context)
    ).json();
    expect(emptyRes.result.structuredContent.items).toEqual([]);
  });

  it('calls label_resolve_names with normal names or empty array', async () => {
    const f = labelFixture();
    const normalRes = await (
      await f.gateway.fetch(
        request('tools/call', { names: ['Work'] }, 'label_resolve_names'),
        context,
      )
    ).json();
    expect(normalRes.result.structuredContent.items).toHaveLength(1);
    expect(f.labels.resolveNames).toHaveBeenCalledWith(
      ['Work'],
      expect.objectContaining({ identityId: 'owner-a' }),
      expect.anything(),
    );

    const emptyRes = await (
      await f.gateway.fetch(request('tools/call', { names: [] }, 'label_resolve_names'), context)
    ).json();
    expect(emptyRes.result.structuredContent.items).toEqual([]);
  });

  it('rejects label tool invocation with 403 when scope is missing and 404 when disabled', async () => {
    const withoutScope = labelFixture(true, ['goals:read']);
    expect(
      (await withoutScope.gateway.fetch(request('tools/call', {}, 'label_list'), context)).status,
    ).toBe(403);

    const disabled = labelFixture(false, ['labels:read']);
    expect(
      (await disabled.gateway.fetch(request('tools/call', {}, 'label_list'), context)).status,
    ).toBe(404);
  });
});
