import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IAccountRepository } from '../../../../domain/repositories/i-account-repository';
import { Account } from '../../../../domain/aggregates/account';
import { AccountStatus } from '@memoflow/contracts/account';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { GetAccountProfileUseCase } from '../get-account-profile.use-case';
import { asInstant } from '@memoflow/time';

describe('GetAccountProfileUseCase', () => {
  let repo: ReturnType<typeof createMockRepo<IAccountRepository>>;
  let useCase: GetAccountProfileUseCase;

  function anAccount(nicknameSeed = 'Get User') {
    return Account.create({
      id: IdentityId.generate(),
      nicknameSeed,
      now: asInstant(1_700_000_000_000),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createMockRepo<IAccountRepository>();
    useCase = new GetAccountProfileUseCase(repo);
  });

  it('should return account client DTO when found', async () => {
    const account = anAccount();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(account);

    const result = await useCase.execute({ identityId: account.id.toString() });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).not.toBeNull();
      expect(result.data!.profile.nickname).toBe('Get User');
      expect(result.data).not.toHaveProperty('email');
      expect(result.data!.status).toBe(AccountStatus.Active);
    }
  });

  it('should return ok(null) when account not found', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await useCase.execute({ identityId: 'nonexistent' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeNull();
    }
  });

  it('should call findById with the provided account ID', async () => {
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await useCase.execute({ identityId: 'test-id-123' });

    expect(repo.findById).toHaveBeenCalledWith('test-id-123');
  });
});
