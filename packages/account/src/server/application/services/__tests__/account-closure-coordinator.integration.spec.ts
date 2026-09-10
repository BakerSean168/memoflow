import { describe, it, expect } from 'vitest';
import { AccountClosureCoordinator } from '../account-closure-coordinator';
import { InMemoryAccountClosureOperationRepository } from '../../../infrastructure/adapters/in-memory/account-closure-operation-in-memory.repository';
import type { IAccountRepository } from '../../../domain/repositories/i-account-repository';
import type { CloudAuthRevocationPort } from '../../ports/cloud-auth-revocation.port';
import type {
  AccountClosureEventPublisher,
  AccountClosedEventPayload,
} from '../../ports/account-closure-event-publisher.port';
import { Account } from '../../../domain/aggregates/account';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { AccountStatus } from '../../../domain/value-objects';
import { createAccountModule, createAccountUseCases } from '../../../infrastructure/account.module';
import { asInstant, createFixedClock } from '@memoflow/time';

class InMemoryAccountRepository implements IAccountRepository {
  private readonly accounts = new Map<string, Account>();

  async save(account: Account): Promise<void> {
    this.accounts.set(account.id.toString(), account);
  }

  async findById(id: string): Promise<Account | null> {
    const acc = this.accounts.get(id);
    return acc ? acc : null;
  }

  async delete(id: string): Promise<void> {
    this.accounts.delete(id);
  }

  async findAll(): Promise<{ accounts: Account[]; total: number }> {
    const list = Array.from(this.accounts.values());
    return { accounts: list, total: list.length };
  }
}

describe('AccountClosureCoordinator Integration Tests', () => {
  it('should run full saga: account closed, sessions revoked, and account-closed event emitted', async () => {
    const accountRepo = new InMemoryAccountRepository();
    const closureOpRepo = new InMemoryAccountClosureOperationRepository();

    const identityId = IdentityId.generate().toString();
    const account = Account.create({
      id: IdentityId.of(identityId),
      nicknameSeed: 'Test Saga',
      now: asInstant(1_700_000_000_000),
    });
    await accountRepo.save(account);

    let sessionsRevoked = 0;
    const revocationPort: CloudAuthRevocationPort = {
      async revokeAuthentication(id: string) {
        if (id === identityId) {
          sessionsRevoked += 5;
          return { revokedSessions: 5, userDisabled: true };
        }
        return { revokedSessions: 0, userDisabled: false };
      },
      async deleteUserData() {
        return { piiCleanupStatus: 'completed', deletedAt: Date.now() };
      },
    };

    const publishedEvents: AccountClosedEventPayload[] = [];
    const eventPublisher: AccountClosureEventPublisher = {
      async publishAccountClosed(event) {
        publishedEvents.push(event);
      },
    };

    const coordinator = new AccountClosureCoordinator({
      accountRepository: accountRepo,
      closureOperationRepository: closureOpRepo,
      revocationPort,
      eventPublisher,
      clock: createFixedClock(1_700_000_000_000),
    });

    const receipt = await coordinator.execute(identityId, 'integration-key-1');

    expect(receipt.status).toBe('succeeded');
    expect(receipt.phase).toBe('closed');
    expect(sessionsRevoked).toBe(5);

    const updatedAccount = await accountRepo.findById(identityId);
    expect(updatedAccount).not.toBeNull();
    expect(AccountStatus.isClosed(updatedAccount!.status)).toBe(true);

    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].identityId).toBe(identityId);
  });

  it('should isolate idempotency keys by identityId and reject cross-tenant receipt leak', async () => {
    const accountRepo = new InMemoryAccountRepository();
    const closureOpRepo = new InMemoryAccountClosureOperationRepository();

    const userA = IdentityId.generate().toString();
    const userB = IdentityId.generate().toString();
    await accountRepo.save(
      Account.create({
        id: IdentityId.of(userA),
        nicknameSeed: 'User A',
        now: asInstant(1_700_000_000_000),
      }),
    );
    await accountRepo.save(
      Account.create({
        id: IdentityId.of(userB),
        nicknameSeed: 'User B',
        now: asInstant(1_700_000_000_000),
      }),
    );

    const revocationPort: CloudAuthRevocationPort = {
      async revokeAuthentication() {
        return { revokedSessions: 1, userDisabled: true };
      },
      async deleteUserData() {
        return { piiCleanupStatus: 'completed', deletedAt: Date.now() };
      },
    };

    const coordinator = new AccountClosureCoordinator({
      accountRepository: accountRepo,
      closureOperationRepository: closureOpRepo,
      revocationPort,
      eventPublisher: { publishAccountClosed: async () => {} },
      clock: createFixedClock(1_700_000_000_000),
    });

    const sameKey = 'shared-key-123';
    const receiptA = await coordinator.execute(userA, sameKey);
    const receiptB = await coordinator.execute(userB, sameKey);

    expect(receiptA.identityId).toBe(userA);
    expect(receiptB.identityId).toBe(userB);
    expect(receiptA.operationId).not.toBe(receiptB.operationId);
  });

  it('should fail-fast on composition root if API lane dependencies are missing', () => {
    const accountRepo = new InMemoryAccountRepository();
    expect(() =>
      createAccountUseCases({
        accountRepository: accountRepo,
        laneCapability: 'api',
      }),
    ).toThrow('CloseAccountUseCase requires AccountClosureCoordinator');
  });

  it('should delegate closure capability on desktop lane composition root', () => {
    const accountRepo = new InMemoryAccountRepository();
    const useCases = createAccountUseCases({
      accountRepository: accountRepo,
      laneCapability: 'desktop',
    });
    expect(useCases.closeAccount).toBeDefined();
  });
});
