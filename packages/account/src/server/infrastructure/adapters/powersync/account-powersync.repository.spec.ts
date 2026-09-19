import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared/shared';
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
});
