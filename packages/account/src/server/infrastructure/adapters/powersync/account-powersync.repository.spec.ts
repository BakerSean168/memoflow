import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdentityId } from '@memoflow/utils/domain';
import { eventBus } from '@memoflow/utils/domain';
import { Account } from '../../../domain';
import { asInstant } from '@memoflow/time';
import { PowerSyncAccountRepository, type Transactional } from './account-powersync.repository';

function createQueryable() {
  return {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ count: 0 }),
    getOptional: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue(undefined),
  };
}

describe('PowerSyncAccountRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists with the provided transaction and flushes domain events', async () => {
    const defaultDb = {
      ...createQueryable(),
      writeTransaction: vi.fn(),
    } satisfies Transactional;
    const tx = createQueryable();
    const dispatchSpy = vi.spyOn(eventBus, 'dispatch').mockResolvedValue(undefined);
    const account = Account.create({
      id: IdentityId.generate(),
      nicknameSeed: 'Transaction User',
      now: asInstant(1_700_000_000_000),
    });
    const repository = new PowerSyncAccountRepository(defaultDb);

    await repository.save(account, tx);

    expect(tx.getOptional).toHaveBeenCalledOnce();
    expect(tx.execute).toHaveBeenCalledOnce();
    expect(defaultDb.getOptional).not.toHaveBeenCalled();
    expect(defaultDb.execute).not.toHaveBeenCalled();
    // W5 metadata contract: the reliable delivery adapter now passes the envelope
    // metadata (aggregateId / occurredAt / optional idempotencyKey) as the 3rd arg.
    expect(dispatchSpy).toHaveBeenCalledWith(
      'account:created',
      expect.any(Object),
      expect.objectContaining({
        aggregateId: expect.any(String),
        occurredAt: expect.any(Date),
      }),
    );
    expect(account.domainEvents).toHaveLength(0);
  });

  it('reads a stored null nickname as the createDefault fallback instead of throwing', async () => {
    const id = 'IdentityId_00000000-0000-4000-8000-000000000001';
    const db = {
      ...createQueryable(),
      writeTransaction: vi.fn(),
    } satisfies Transactional;
    db.getOptional.mockResolvedValue({
      id,
      status: 'Active',
      profile: JSON.stringify({
        nickname: null,
        realName: null,
        avatarUrl: null,
        bio: null,
        gender: 'PreferNotToSay',
        birthday: null,
      }),
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-01T00:00:00.000Z',
      closed_at: null,
    });

    const account = await new PowerSyncAccountRepository(db).findById(id);

    expect(account?.profile.nickname).toBe('User');
  });
});
