import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import { Account } from '../../../../domain';
import { IdentityId } from '@memoflow/utils/domain';
import type { IAccountRepository } from '../../../../domain';
import type {
  AccountAvatarRecord,
  IAccountAvatarRepository,
} from '../../../../domain/repositories/i-account-avatar-repository';
import { UpdateAccountAvatarUseCase } from '../update-account-avatar.use-case';
import { GetAccountAvatarUseCase } from '../../queries/get-account-avatar.use-case';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]).toString(
  'base64',
);
const DATA_URL = `data:image/png;base64,${PNG}`;
const ID_A = IdentityId.generate();
const ID_B = IdentityId.generate();

function context(identityId: string = ID_A.toString()): ExecutionContext {
  return { identityId } as ExecutionContext;
}

function accountFor(id: string = ID_A.toString(), now = 1_000): Account {
  return Account.create({ id: IdentityId.of(id), nicknameSeed: 'Avatar User', now });
}

function repositoryWith(account: Account): IAccountRepository {
  return {
    save: vi.fn(async () => undefined),
    findById: vi.fn(async (id: string) => (id === account.id.toString() ? account : null)),
    delete: vi.fn(),
    findAll: vi.fn(),
  } as unknown as IAccountRepository;
}

function avatarRepository(
  initial: AccountAvatarRecord | null = null,
): IAccountAvatarRepository & { stored: AccountAvatarRecord | null } {
  const repo = {
    stored: initial,
    find: vi.fn(async () => repo.stored),
    upsert: vi.fn(async (_id: string, bytes: Uint8Array, updatedAt: number) => {
      repo.stored = { bytes, updatedAt };
    }),
  };
  return repo as unknown as IAccountAvatarRepository & { stored: AccountAvatarRecord | null };
}

describe('UpdateAccountAvatarUseCase', () => {
  it('stores the authenticated account avatar bytes and last-write-wins timestamp', async () => {
    const account = accountFor();
    const avatars = avatarRepository();
    const useCase = new UpdateAccountAvatarUseCase(repositoryWith(account), avatars, {
      now: () => 2_000,
    } as never);

    const result = await useCase.execute({ dataUrl: DATA_URL }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.updatedAt).toBe(2_000);
    expect(avatars.stored?.updatedAt).toBe(2_000);
    expect(Buffer.from(avatars.stored!.bytes).toString('base64')).toBe(PNG);
    expect(account.avatarUpdatedAt).toBe(2_000);
  });

  it('rejects an upload that targets another account id (ownership guard)', async () => {
    const account = accountFor();
    const avatars = avatarRepository();
    const accountRepository = repositoryWith(account);
    const useCase = new UpdateAccountAvatarUseCase(accountRepository, avatars, {
      now: () => 2_000,
    } as never);

    const result = await useCase.execute(
      { dataUrl: DATA_URL, targetAccountId: ID_B.toString() },
      context(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('FORBIDDEN');
    expect(avatars.upsert).not.toHaveBeenCalled();
    expect(accountRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a payload that is not a PNG data URL', async () => {
    const account = accountFor();
    const avatars = avatarRepository();
    const useCase = new UpdateAccountAvatarUseCase(repositoryWith(account), avatars, {
      now: () => 2_000,
    } as never);

    const result = await useCase.execute(
      { dataUrl: 'data:image/png;base64,bm90LWEtcG5n' },
      context(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(avatars.upsert).not.toHaveBeenCalled();
  });
});

describe('GetAccountAvatarUseCase', () => {
  it('returns the stored data URL and timestamp for the authenticated account', async () => {
    const avatars = avatarRepository({ bytes: Buffer.from(PNG, 'base64'), updatedAt: 2_000 });
    const useCase = new GetAccountAvatarUseCase(avatars);

    const content = await useCase.execute(context());
    const meta = await useCase.meta(context());

    expect(content.ok && content.data).toEqual({ dataUrl: DATA_URL, updatedAt: 2_000 });
    expect(meta.ok && meta.data).toEqual({ updatedAt: 2_000 });
  });

  it('reports no avatar without leaking another identity', async () => {
    const avatars = avatarRepository();
    const useCase = new GetAccountAvatarUseCase(avatars);

    const content = await useCase.execute(context());
    const meta = await useCase.meta(context());

    expect(content.ok).toBe(false);
    expect(meta.ok && meta.data).toEqual({ updatedAt: null });
    expect(avatars.find).toHaveBeenCalledWith(ID_A.toString());
  });
});
