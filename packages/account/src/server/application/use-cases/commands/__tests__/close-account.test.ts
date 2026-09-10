import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IAccountRepository } from '../../../../domain/repositories/i-account-repository';
import { Account } from '../../../../domain/aggregates/account';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { CloseAccountUseCase } from '../close-account.use-case';
import { AccountClosureCoordinator } from '../../../services/account-closure-coordinator';
import { InMemoryAccountClosureOperationRepository } from '../../../../infrastructure/adapters/in-memory/account-closure-operation-in-memory.repository';
import type { CloudAuthRevocationPort } from '../../../ports/cloud-auth-revocation.port';
import type { AccountClosureEventPublisher } from '../../../ports/account-closure-event-publisher.port';
import { asInstant, createFixedClock } from '@memoflow/time';

describe('CloseAccountUseCase', () => {
  let repo: ReturnType<typeof createMockRepo<IAccountRepository>>;
  let closureOpRepo: InMemoryAccountClosureOperationRepository;
  let mockRevocationPort: CloudAuthRevocationPort;
  let mockEventPublisher: AccountClosureEventPublisher;
  let coordinator: AccountClosureCoordinator;
  let useCase: CloseAccountUseCase;

  function anAccount(overrides: { id?: IdentityId; nicknameSeed?: string } = {}) {
    return Account.create({
      id: overrides.id ?? IdentityId.generate(),
      nicknameSeed: overrides.nicknameSeed ?? 'Test User',
      now: asInstant(1_700_000_000_000),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createMockRepo<IAccountRepository>({
      save: vi.fn().mockResolvedValue(undefined),
    });
    closureOpRepo = new InMemoryAccountClosureOperationRepository();
    mockRevocationPort = {
      revokeAll: vi.fn().mockResolvedValue({ revokedSessions: 1 }),
    };
    mockEventPublisher = {
      publishAccountClosed: vi.fn().mockResolvedValue(undefined),
    };
    coordinator = new AccountClosureCoordinator({
      accountRepository: repo,
      closureOperationRepository: closureOpRepo,
      revocationPort: mockRevocationPort,
      eventPublisher: mockEventPublisher,
      clock: createFixedClock(1_700_000_000_200),
    });
    useCase = new CloseAccountUseCase(coordinator);
  });

  it('should close an active account and return closure receipt', async () => {
    const account = anAccount();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(account);

    const result = await useCase.execute(
      { reason: 'Test', feedback: '' },
      { identityId: account.id.toString() },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe('succeeded');
      expect(result.data.phase).toBe('closed');
    }
    expect(repo.save).toHaveBeenCalled();
    expect(mockRevocationPort.revokeAll).toHaveBeenCalledWith(account.id.toString());
    expect(mockEventPublisher.publishAccountClosed).toHaveBeenCalled();
  });

  it('should return NOT_FOUND if account not found', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await useCase.execute(
      { reason: 'Test', feedback: '' },
      { identityId: 'nonexistent' },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('should handle already closed account idempotently and return succeeded receipt', async () => {
    const account = anAccount();
    account.close(asInstant(1_700_000_000_100)); // first close succeeds
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(account);

    const result = await useCase.execute(
      { reason: 'Again', feedback: '' },
      { identityId: account.id.toString() },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe('succeeded');
    }
  });
});
