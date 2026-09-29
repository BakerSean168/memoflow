import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWebAuthCapabilities } from './capabilities';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('loadWebAuthCapabilities', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns an explicitly disabled provider without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { providers: { github: false } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadWebAuthCapabilities()).resolves.toEqual({ github: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recovers from a transient gateway failure without requiring a page refresh', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(502, { message: 'Bad Gateway' }))
      .mockResolvedValueOnce(jsonResponse(200, { providers: { github: true } }));
    vi.stubGlobal('fetch', fetchMock);

    const capabilities = loadWebAuthCapabilities();
    await vi.runAllTimersAsync();

    await expect(capabilities).resolves.toEqual({ github: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a temporary network failure and then restores GitHub login', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { providers: { github: true } }));
    vi.stubGlobal('fetch', fetchMock);

    const capabilities = loadWebAuthCapabilities();
    await vi.runAllTimersAsync();

    await expect(capabilities).resolves.toEqual({ github: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed immediately for non-retryable client errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { message: 'not found' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadWebAuthCapabilities()).resolves.toEqual({ github: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed after the bounded transient retry window is exhausted', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, { message: 'unavailable' }));
    vi.stubGlobal('fetch', fetchMock);

    const capabilities = loadWebAuthCapabilities();
    await vi.runAllTimersAsync();

    await expect(capabilities).resolves.toEqual({ github: false });
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});
