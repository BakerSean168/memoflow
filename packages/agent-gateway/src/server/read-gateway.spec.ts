import { describe, expect, it, vi } from 'vitest';
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

describe('Routine hosted write capability', () => {
  function routineFixture(
    enabled = true,
    type: 'pat' | 'oauth' = 'pat',
    scopes = ['routines:write'],
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
    const routineCreate = vi.fn(async (_input, _cx, authority) => {
      await authority.authorize();
      return receipt;
    });
    const unavailable = vi.fn().mockRejectedValue(new Error('Unexpected owner'));
    const writes = {
      goalCreate: unavailable,
      goalUpdate: unavailable,
      keyResultCreate: unavailable,
      keyResultUpdate: unavailable,
      taskCreate: unavailable,
      taskUpdate: unavailable,
      taskComplete: unavailable,
      ...(enabled ? { routineCreate } : {}),
    };
    return { ...f, routineCreate, gateway: createReadGateway({ ...f.options, writes }) };
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
  it('discovers exactly routine_create with a routine-only PAT, and keeps the separate gate off', async () => {
    const f = routineFixture();
    expect(
      (await (await f.gateway.fetch(request('tools/list'), context)).json()).result.tools.map(
        (t) => t.name,
      ),
    ).toEqual(['routine_create']);
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
  it('denies OAuth even with a fabricated write scope', async () => {
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
});
