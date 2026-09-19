import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import type { IAccountApiClient } from '../ports/account-api-client.port';
import { AccountClientService } from './account-client-service';

describe('AccountClientService', () => {
  it('returns NOT_FOUND instead of throwing when a transport violates the contract with ok(null)', async () => {
    const apiClient = {
      getMyProfile: vi.fn().mockResolvedValue(ok(null)),
    } as unknown as IAccountApiClient;
    const service = new AccountClientService(apiClient);

    await expect(service.getMyProfile()).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('maps AccountView without copying Cloud identity into the Account aggregate', async () => {
    const account = {
      id: 'IdentityId_123e4567-e89b-12d3-a456-426614174000',
      status: 'Active',
      profile: {
        nickname: 'Memo',
        realName: null,
        avatarUrl: null,
        bio: null,
        gender: 'PreferNotToSay',
        birthday: null,
      },
      createdAt: 1,
      updatedAt: 2,
      closedAt: null,
    } as const;
    const cloudIdentity = {
      identityId: account.id,
      email: 'login@example.com',
      emailVerified: true,
    } as const;
    const apiClient = {
      getMyProfile: vi.fn().mockResolvedValue(ok({ account, cloudIdentity })),
    } as unknown as IAccountApiClient;
    const service = new AccountClientService(apiClient);

    const result = await service.getMyProfile();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.account.toDTO()).not.toHaveProperty('email');
    expect(result.data.cloudIdentity).toEqual(cloudIdentity);
    expect(result.data.account.toDTO()).not.toHaveProperty('cloudIdentity');
  });
});
