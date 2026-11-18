import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExternalAgentHttpClient } from './external-agent-client';
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
