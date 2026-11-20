import { afterEach, describe, expect, it, vi } from 'vitest';
import { fail, ok, type Result } from '@memoflow/transport-contracts/result';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { ExternalAgentChannels } from '@memoflow/desktop-contracts';
import {
  createExternalAgentBearerClient,
  createExternalAgentHttpClient,
  createExternalAgentIpcClient,
} from './external-agent-client';
import { ExternalAgentFailureSchema, externalAgentFailure } from '@memoflow/agent-gateway';

afterEach(() => vi.unstubAllGlobals());
describe('external agent management failure contract', () => {
  it.each([
    [401, 'EAG_UNAUTHORIZED'],
    [400, 'EAG_CONSENT_INVALID'],
    [403, 'EAG_FORBIDDEN'],
    [404, 'EAG_SERVICE_DISABLED'],
    [429, 'EAG_RATE_LIMITED'],
    [503, 'EAG_SERVICE_UNAVAILABLE'],
  ])('normalizes HTTP %s without exposing provider messages', async (status, code) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: 'private diagnostic' }), { status }),
        ),
    );
    expect(
      await createExternalAgentHttpClient('https://memo.test').consentRequest('signed'),
    ).toMatchObject({ ok: false, error: { code } });
  });
  it('distinguishes malformed responses from unavailable network', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('not json'));
    vi.stubGlobal('fetch', fetcher);
    const client = createExternalAgentHttpClient('https://memo.test');
    expect(await client.capabilities()).toMatchObject({
      ok: false,
      error: { code: 'EAG_INVALID_RESPONSE' },
    });
    fetcher.mockRejectedValue(new TypeError('network'));
    expect(await client.capabilities()).toMatchObject({
      ok: false,
      error: { code: 'EAG_NETWORK_ERROR' },
    });
  });
});

it('maps a 409 receipt conflict without exposing provider details', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'IDEMPOTENCY_CONFLICT' }), { status: 409 }),
      ),
  );
  expect(
    await createExternalAgentHttpClient('https://memo.test').createPat({
      name: 'new1',
      idempotencyKey: 'web-click-1',
    }),
  ).toMatchObject({ ok: false, error: { code: 'EAG_CONFLICT' } });
});

it('sends the idempotency key in both the body and the transport header', async () => {
  const summary = {
    id: '5b5d8a2b-9934-4be8-8e07-3f62ed122e15',
    name: 'new1',
    prefix: 'mfp_AbCdEfG',
    audience: 'https://memo.test/mcp',
    scopes: ['goals:read'],
    createdAt: '2026-11-18T00:00:00.000Z',
    expiresAt: '2027-02-16T00:00:00.000Z',
    revokedAt: null,
    lastUsedAt: null,
    secret: 'mfp_once',
    replayed: false,
  };
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ data: summary }), { status: 201 }));
  vi.stubGlobal('fetch', fetcher);
  const result = await createExternalAgentHttpClient('https://memo.test').createPat({
    name: 'new1',
    idempotencyKey: 'web-click-1',
  });
  expect(result).toMatchObject({ ok: true, data: { id: summary.id, secret: 'mfp_once' } });
  const init = fetcher.mock.calls[0][1] as RequestInit;
  expect(init.method).toBe('POST');
  expect(init.headers).toMatchObject({
    'content-type': 'application/json',
    'idempotency-key': 'web-click-1',
  });
  expect(JSON.parse(String(init.body))).toMatchObject({
    name: 'new1',
    idempotencyKey: 'web-click-1',
  });
});

it('rejects diagnostic or credential fields in public failure details', async () => {
  const failure = externalAgentFailure('EAG_NETWORK_ERROR');
  expect(failure.category).toBe('unavailable');
  expect(failure.retryHint).toEqual({ kind: 'transient' });
  expect(
    ExternalAgentFailureSchema.safeParse({ ...failure, details: { token: 'never-public' } })
      .success,
  ).toBe(false);
  expect(
    ExternalAgentFailureSchema.safeParse({ ...failure, providerBody: 'never-public' }).success,
  ).toBe(false);
});

describe('desktop bearer transport (#1030)', () => {
  it('sends the session token as a bearer credential with the trusted Web Origin', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    const result = await createExternalAgentBearerClient({
      origin: 'https://api.memo.test',
      webOrigin: 'https://memo.test',
      token: 'session-token',
    }).listPats();

    expect(result).toMatchObject({ ok: true, data: [] });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.memo.test/api/v1/agent-connections/pats');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer session-token',
      origin: 'https://memo.test',
    });
    expect(init.credentials).toBeUndefined();
  });

  it('keeps the Web cookie transport for the browser client', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    await createExternalAgentHttpClient('https://api.memo.test/api/v1').listPats();

    const [, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
    expect(init.headers).toBeUndefined();
  });
});

describe('desktop IPC transport (#1030)', () => {
  const summary = {
    id: '5b5d8a2b-9934-4be8-8e07-3f62ed122e15',
    name: 'desktop agent',
    prefix: 'mfp_Desktop',
    audience: 'https://memo.test/mcp',
    scopes: ['goals:read'],
    createdAt: '2026-11-18T00:00:00.000Z',
    expiresAt: '2027-02-16T00:00:00.000Z',
    revokedAt: null,
  };

  function fixture(handler: (channel: string, ...args: unknown[]) => Promise<Result<unknown>>) {
    const invoke = vi.fn(handler);
    const client = createExternalAgentIpcClient({ invoke } as unknown as IResultIpcClient);
    return { client, invoke };
  }

  it('routes every management operation through its own channel', async () => {
    const { client, invoke } = fixture(async (channel) => {
      if (channel === ExternalAgentChannels.CAPABILITIES) return ok({ oauth: true });
      if (channel === ExternalAgentChannels.CREATE_PAT)
        return ok({ ...summary, secret: 'mfp_once', replayed: false });
      if (
        channel === ExternalAgentChannels.LIST_PATS ||
        channel === ExternalAgentChannels.LIST_CONNECTIONS
      )
        return ok([]);
      return ok(undefined);
    });

    expect(await client.capabilities()).toMatchObject({ ok: true, data: { oauth: true } });
    expect(await client.listPats()).toMatchObject({ ok: true, data: [] });
    expect(await client.listConnections()).toMatchObject({ ok: true, data: [] });
    expect(await client.createPat({ name: 'desktop agent', scopes: ['goals:read'] })).toMatchObject(
      { ok: true, data: { secret: 'mfp_once' } },
    );
    expect(await client.revokePat(summary.id)).toMatchObject({ ok: true });
    expect(await client.revokeConnection(summary.id)).toMatchObject({ ok: true });

    expect(invoke.mock.calls.map(([channel]) => channel)).toEqual([
      ExternalAgentChannels.CAPABILITIES,
      ExternalAgentChannels.LIST_PATS,
      ExternalAgentChannels.LIST_CONNECTIONS,
      ExternalAgentChannels.CREATE_PAT,
      ExternalAgentChannels.REVOKE_PAT,
      ExternalAgentChannels.REVOKE_CONNECTION,
    ]);
    expect(invoke.mock.calls[3][1]).toMatchObject({
      name: 'desktop agent',
      scopes: ['goals:read'],
      expiresInDays: 90,
    });
    expect(invoke.mock.calls[4][1]).toBe(summary.id);
  });

  it('restores the typed public failure the main process returned', async () => {
    const { client } = fixture(async () =>
      fail({
        code: 'EAG_FORBIDDEN',
        message: 'denied',
        failure: externalAgentFailure('EAG_FORBIDDEN'),
      }),
    );
    expect(await client.listPats()).toMatchObject({ ok: false, error: { code: 'EAG_FORBIDDEN' } });
  });

  it('never exposes an untyped IPC error as a domain failure', async () => {
    const { client } = fixture(async () => fail({ code: 'INTERNAL_ERROR', message: 'boom' }));
    expect(await client.capabilities()).toMatchObject({
      ok: false,
      error: { code: 'EAG_INVALID_RESPONSE' },
    });
  });

  it('does not invoke the main process for invalid PAT input', async () => {
    const { client, invoke } = fixture(async () => ok(summary));
    expect(() => client.createPat({ name: '', scopes: ['goals:read'] } as never)).toThrow();
    expect(() => client.revokePat('not-a-uuid')).toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
});
