import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExternalAgentHttpClient } from './external-agent-client';

afterEach(() => vi.unstubAllGlobals());
describe('external agent management failure contract', () => {
  it.each([
    [401, 'UNAUTHORIZED'],
    [400, 'CONSENT_INVALID'],
    [403, 'FORBIDDEN'],
    [404, 'SERVICE_DISABLED'],
    [429, 'RATE_LIMITED'],
    [503, 'SERVICE_UNAVAILABLE'],
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
    ).toEqual({ ok: false, error: { code } });
  });
  it('distinguishes malformed responses from unavailable network', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('not json'));
    vi.stubGlobal('fetch', fetcher);
    const client = createExternalAgentHttpClient('https://memo.test');
    expect(await client.capabilities()).toEqual({ ok: false, error: { code: 'INVALID_RESPONSE' } });
    fetcher.mockRejectedValue(new TypeError('network'));
    expect(await client.capabilities()).toEqual({ ok: false, error: { code: 'NETWORK_ERROR' } });
  });
});
