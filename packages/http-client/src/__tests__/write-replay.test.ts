import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { ResultHttpClient } from '../result-http-client';

function unauthorized(config: AxiosRequestConfig): never {
  throw {
    config,
    message: 'Unauthorized',
    response: { status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config },
  };
}

function envelope(config: InternalAxiosRequestConfig): AxiosResponse {
  return {
    status: 200,
    statusText: 'OK',
    data: { ok: true, data: { id: 'pat-1' } },
    headers: {},
    config,
  };
}

describe('ResultHttpClient write replay after token refresh', () => {
  it('does not resend an unkeyed write but still refreshes the session', async () => {
    const requests: string[] = [];
    const refresh = vi.fn().mockResolvedValue('fresh-token');
    const onUnauthorized = vi.fn();
    const client = new ResultHttpClient({
      baseURL: '/api/v1',
      axiosConfig: {
        adapter: async (config) => {
          requests.push(`${config.method}:${config.url}`);
          return unauthorized(config) as never;
        },
      },
      onTokenRefresh: refresh,
      onUnauthorized,
    });

    const result = await client.post('/agent-connections/pats', { name: 'new1' });

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.code).toBe('UNAUTHORIZED');
    expect(requests).toEqual(['post:/agent-connections/pats']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('replays reads and writes carrying an idempotency key', async () => {
    const requests: string[] = [];
    const attempts = new Map<string, number>();
    const refreshedHeaders: unknown[] = [];
    const client = new ResultHttpClient({
      baseURL: '/api/v1',
      axiosConfig: {
        adapter: async (config) => {
          const key = `${config.method}:${config.url}`;
          requests.push(key);
          const attempt = (attempts.get(key) ?? 0) + 1;
          attempts.set(key, attempt);
          if (attempt === 1) return unauthorized(config) as never;
          refreshedHeaders.push(config.headers?.Authorization);
          return envelope(config);
        },
      },
      onTokenRefresh: async () => 'fresh-token',
    });

    expect((await client.get('/agent-connections/pats')).ok).toBe(true);
    expect(
      (await client.post('/agent-connections/pats', {}, { headers: { 'Idempotency-Key': 'k1' } }))
        .ok,
    ).toBe(true);
    expect(requests).toEqual([
      'get:/agent-connections/pats',
      'get:/agent-connections/pats',
      'post:/agent-connections/pats',
      'post:/agent-connections/pats',
    ]);
    expect(refreshedHeaders).toEqual(['Bearer fresh-token', 'Bearer fresh-token']);
  });
});
