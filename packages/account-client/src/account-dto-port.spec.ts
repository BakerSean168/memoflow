import { describe, expect, it } from 'vitest';
import { ok, fail } from '@memoflow/transport-contracts';
import { createMockAccount } from '@memoflow/account-contracts/test-support/account.mock';
import { createAccountClientService } from './application-client';
import type { IAccountApiClient } from './application-client/ports/account-api-client.port';

/**
 * Account client DTO port.
 *
 * `AccountClientPort` is an alias of `IAccountApiClient` (goal-client G-2 /
 * notification-client ruling): the service hands the transport payloads
 * straight back — no client-side mirror aggregate, no field re-projection.
 */
describe('Account client DTO port', () => {
  it('returns the transport AccountView without wrapping or dropping fields', async () => {
    const account = createMockAccount();
    const view = {
      account,
      cloudIdentity: {
        identityId: account.id,
        email: 'login@example.com',
        emailVerified: true,
      },
    };
    const receipt = {
      operationId: 'closure-1',
      identityId: account.id,
      idempotencyKey: 'key-1',
      phase: 'requested' as const,
      status: 'running' as const,
      retryable: true,
      signedOut: false,
      attempts: 1,
      lastError: null,
      createdAt: 1,
      finishedAt: null,
    };
    const service = createAccountClientService({
      getMyProfile: async () => ok(view),
      updateMyProfile: async () => ok(view),
      closeAccount: async () => ok(receipt),
    } as unknown as IAccountApiClient);

    const profile = await service.getMyProfile();
    const updated = await service.updateMyProfile({ nickname: 'Memo' });
    const closed = await service.closeAccount({ reason: 'user-requested' });

    expect(profile).toEqual(ok(view));
    expect(profile.ok && profile.data).toBe(view);
    expect(updated.ok && updated.data.account).toBe(account);
    expect(closed.ok && closed.data).toBe(receipt);
  });

  it('preserves the transport failure without constructing a client entity', async () => {
    const failure = fail({ code: 'NOT_FOUND', message: 'Account missing' });
    const service = createAccountClientService({
      getMyProfile: async () => failure,
    } as unknown as IAccountApiClient);

    expect(await service.getMyProfile()).toBe(failure);
  });
});
