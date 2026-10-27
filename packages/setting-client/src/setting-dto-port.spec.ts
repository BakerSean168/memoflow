import { describe, expect, it } from 'vitest';
import { fail, ok } from '@memoflow/transport-contracts';
import type { UserPreferenceProfile } from '@memoflow/setting-contracts';
import { createSettingHttpClient } from './index';
import type { ISettingApiClient } from './application-client';

const profile: UserPreferenceProfile = {
  presentation: { theme: 'dark', language: 'zh-CN' },
  regional: { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: '24h', weekStartsOn: 1 },
};

const httpStub = (payload: unknown) => ({
  get: async () => ok(payload),
  post: async () => ok(payload),
  put: async () => ok(payload),
  patch: async () => ok(payload),
  delete: async () => ok(payload),
  stream: async () => ok(payload),
});

describe('Setting client DTO port', () => {
  it('returns the contracts DTOs without wrapping or dropping fields', async () => {
    const client: ISettingApiClient = createSettingHttpClient(httpStub(profile) as never);

    const result = await client.getPreferenceProfile();

    expect(result).toEqual(ok(profile));
    expect(result.ok && result.data).toBe(profile);
  });

  it('preserves the transport failure without constructing a client entity', async () => {
    const failure = fail({ code: 'NOT_FOUND', message: 'Profile missing' });
    const client = createSettingHttpClient({ get: async () => failure } as never);

    expect(await client.getPreferenceProfile()).toBe(failure);
  });
});
