import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExternalAgentHttpClient } from './external-agent-client';
import {
  ExternalAgentFailureSchema,
  externalAgentFailure,
} from '@memoflow/contracts/agent-gateway';

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
