import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountClosureCoordinator } from '../account-closure-coordinator';
import { InMemoryAccountClosureOperationRepository } from '../../../infrastructure/adapters/in-memory/account-closure-operation-in-memory.repository';
import type { IAccountRepository } from '../../../domain/repositories/i-account-repository';
import type { CloudAuthRevocationPort } from '../../ports/cloud-auth-revocation.port';
import type { AccountClosureEventPublisher } from '../../ports/account-closure-event-publisher.port';
import { Account } from '../../../domain/aggregates/account';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { AccountStatus } from '../../../domain/value-objects';
import { createUnifiedOperationMetricsRecorder } from '@memoflow/patterns/operations';
import { asInstant, createFixedClock } from '@memoflow/time';

describe('AccountClosureCoordinator Unit Tests', () => {
  let closureOpRepo: InMemoryAccountClosureOperationRepository;
  let mockAccountRepo: IAccountRepository;
  let mockRevocationPort: CloudAuthRevocationPort;
  let mockEventPublisher: AccountClosureEventPublisher;
  let coordinator: AccountClosureCoordinator;

  const testIdentityId = IdentityId.generate().toString();
  let testAccount: Account;

  beforeEach(() => {
    vi.clearAllMocks();
    closureOpRepo = new InMemoryAccountClosureOperationRepository();

    testAccount = Account.create({
      id: IdentityId.of(testIdentityId),
      nicknameSeed: 'user@example.com',

      now: asInstant(1_700_000_000_000),
    });

    mockAccountRepo = {
      findById: vi.fn().mockImplementation(async (id: string) => {
        if (id === testIdentityId) return testAccount;
        return null;
      }),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      findAll: vi.fn(),
    };

    mockRevocationPort = {
      revokeAll: vi.fn().mockResolvedValue({ revokedSessions: 3 }),
    };

    mockEventPublisher = {
      publishAccountClosed: vi.fn().mockResolvedValue(undefined),
    };

    coordinator = new AccountClosureCoordinator({
      accountRepository: mockAccountRepo,
      closureOperationRepository: closureOpRepo,
      revocationPort: mockRevocationPort,
      eventPublisher: mockEventPublisher,
      clock: createFixedClock(1_700_000_000_000),
    });
  });

  it('should successfully execute closure saga and publish account-closed event', async () => {
    const receipt = await coordinator.execute(testIdentityId, 'idempotency-key-1');

    expect(receipt.status).toBe('succeeded');
    expect(receipt.phase).toBe('closed');
    expect(receipt.lastError).toBeNull();
    expect(receipt.finishedAt).toBe(1700000000000);

    // Verify side effects
    expect(mockRevocationPort.revokeAll).toHaveBeenCalledWith(testIdentityId);
    expect(AccountStatus.isClosed(testAccount.status)).toBe(true);
    expect(mockAccountRepo.save).toHaveBeenCalledWith(testAccount);
    expect(mockEventPublisher.publishAccountClosed).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: testIdentityId,
        accountId: testIdentityId,
        reason: 'User requested closure',
      }),
    );
  });

  it('should be idempotent: second call with same key returns existing receipt without re-running side effects', async () => {
    const receipt1 = await coordinator.execute(testIdentityId, 'idempotency-key-2');
    expect(receipt1.status).toBe('succeeded');

    vi.clearAllMocks();

    const receipt2 = await coordinator.execute(testIdentityId, 'idempotency-key-2');
    expect(receipt2).toEqual(receipt1);

    expect(mockRevocationPort.revokeAll).not.toHaveBeenCalled();
    expect(mockEventPublisher.publishAccountClosed).not.toHaveBeenCalled();
  });

  it('should handle failure in revoking phase and allow retry from recovery point', async () => {
    mockRevocationPort.revokeAll = vi
      .fn()
      .mockRejectedValueOnce(new Error('Auth service network error'))
      .mockResolvedValueOnce({ revokedSessions: 2 });

    const receipt1 = await coordinator.execute(testIdentityId, 'idempotency-key-retry');
    expect(receipt1.status).toBe('failed');
    expect(receipt1.phase).toBe('revoking');
    expect(receipt1.lastError).toBe('Auth service network error');
    expect(receipt1.attempts).toBe(1);

    // Account should NOT be closed yet
    expect(AccountStatus.isClosed(testAccount.status)).toBe(false);

    // Retry execution
    const receipt2 = await coordinator.execute(testIdentityId, 'idempotency-key-retry');
    expect(receipt2.status).toBe('succeeded');
    expect(receipt2.phase).toBe('closed');
    expect(receipt2.attempts).toBe(2);
    expect(AccountStatus.isClosed(testAccount.status)).toBe(true);
  });

  it('should handle failure when account is not found', async () => {
    const nonexistentId = IdentityId.generate().toString();
    const receipt = await coordinator.execute(nonexistentId, 'idempotency-key-notfound');

    expect(receipt.status).toBe('failed');
    expect(receipt.phase).toBe('closing');
    expect(receipt.lastError).toContain(`Account not found for identityId: ${nonexistentId}`);
  });

  it('P1-5: drives the real coordinator and asserts unified metric events (persisted/claimed/retried/succeeded/worker)', async () => {
    const recorder = createUnifiedOperationMetricsRecorder();

    const metricsCoordinator = new AccountClosureCoordinator({
      accountRepository: mockAccountRepo,
      closureOperationRepository: closureOpRepo,
      revocationPort: mockRevocationPort,
      eventPublisher: mockEventPublisher,
      clock: createFixedClock(1_700_000_000_000),
      metrics: recorder,
    });

    // Fresh create run: persisted + succeeded + worker.completed.
    const receipt = await metricsCoordinator.execute(testIdentityId, 'idempotency-key-metrics-1');
    expect(receipt.status).toBe('succeeded');
    const snap = recorder.snapshot();
    expect(snap['memoflow.account-closure.outbox.persisted']).toBe(1);
    expect(snap['memoflow.account-closure.outbox.succeeded']).toBe(1);
    expect(snap['memoflow.account-closure.worker.completed']).toBe(1);
    expect(snap['memoflow.account-closure.outbox.failed']).toBeUndefined();

    // retried on re-claiming a failed operation (attempt 1 -> 2), then succeeded.
    const failedCoordinator = new AccountClosureCoordinator({
      accountRepository: mockAccountRepo,
      closureOperationRepository: closureOpRepo,
      revocationPort: {
        revokeAll: vi
          .fn()
          .mockRejectedValueOnce(new Error('auth down'))
          .mockResolvedValueOnce({ revokedSessions: 1 }),
      },
      eventPublisher: mockEventPublisher,
      clock: createFixedClock(1_700_000_000_000),
      metrics: recorder,
    });
    await failedCoordinator.execute(testIdentityId, 'idempotency-key-metrics-2');
    await failedCoordinator.execute(testIdentityId, 'idempotency-key-metrics-2');

    const snap2 = recorder.snapshot();
    expect(snap2['memoflow.account-closure.outbox.retried']).toBeGreaterThanOrEqual(1);
    expect(snap2['memoflow.account-closure.outbox.failed']).toBe(1);
  });

  it('P1-5: claims an existing running closure and emits the claimed metric', async () => {
    const recorder = createUnifiedOperationMetricsRecorder();

    // Seed an existing running closure so the re-claim branch emits `claimed`.
    const now = new Date(1700000000000);
    const existing = {
      id: 'closure-claimed-1',
      identityId: testIdentityId,
      idempotencyKey: 'idempotency-key-claimed',
      phase: 'revoking',
      status: 'running',
      attempts: 1,
      version: 1,
      ownerToken: 'stale-owner',
      leaseExpiresAt: new Date(now.getTime() - 5000),
      nextRetryAt: null,
      deadLetterAt: null,
      eventId: null,
      reason: null,
      revokedSessions: 0,
      piiCleanupStatus: null,
      lastError: null,
      receiptJson: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    };
    await closureOpRepo.create(existing);

    const claimCoordinator = new AccountClosureCoordinator({
      accountRepository: mockAccountRepo,
      closureOperationRepository: closureOpRepo,
      revocationPort: mockRevocationPort,
      eventPublisher: mockEventPublisher,
      clock: createFixedClock(1_700_000_000_000),
      metrics: recorder,
    });
    const receipt = await claimCoordinator.execute(testIdentityId, 'idempotency-key-claimed');
    expect(receipt.status).toBe('succeeded');
    expect(recorder.snapshot()['memoflow.account-closure.outbox.claimed']).toBeGreaterThanOrEqual(
      1,
    );
  });
});
