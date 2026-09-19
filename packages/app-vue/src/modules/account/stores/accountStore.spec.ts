import { beforeEach, describe, expect, it } from 'vitest';
import type { AccountClientDTO } from '@memoflow/contracts/account';
import { AccountStatus } from '@memoflow/contracts/account';
import { createTestPinia } from '@memoflow/test-utils';
import { useAccountStore } from './account-store';

function createAccount(overrides: Partial<AccountClientDTO> = {}): AccountClientDTO {
  return {
    id: 'account-1' as AccountClientDTO['id'],
    status: AccountStatus.Active,
    profile: {
      nickname: 'Baker',
      avatarUrl: 'avatar.png',
    },
    ...overrides,
  } as AccountClientDTO;
}

describe('useAccountStore', () => {
  beforeEach(() => {
    createTestPinia();
  });

  it('exposes account identity, product profile, and lifecycle actions', () => {
    const store = useAccountStore();
    store.setCurrentAccount(createAccount());
    store.setInitialized(true);
    store.setLoading(true);
    store.setError('failed');

    expect(store.getCurrentAccountId).toBe('account-1');
    expect(store.getAccountStatus).toBe(AccountStatus.Active);
    expect(store.isActiveAccount).toBe(true);
    expect(store.getNickname).toBe('Baker');
    expect(store.getAvatarUrl).toBe('avatar.png');
    expect(store.isLoading).toBe(true);
    expect(store.error).toBe('failed');

    store.clearCurrentAccount();
    expect(store.currentAccount).toBeNull();

    store.reset();
    expect(store.isInitialized).toBe(false);
    expect(store.isLoading).toBe(false);
    expect(store.error).toBeNull();
  });
});
