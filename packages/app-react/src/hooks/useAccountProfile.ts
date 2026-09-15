import { useEffect, useState } from 'react';

import type { AccountClientDTO, CloudIdentitySummary } from '@memoflow/contracts/account';
import { presentErrorMessage } from '@memoflow/http-client';

import { useAppSession } from './useAppSession';
import { useAccountService } from './useAccountService';

export function useAccountProfile() {
  const service = useAccountService();
  const { currentIdentity, isRemoteAuthenticated } = useAppSession();
  const [account, setAccount] = useState<AccountClientDTO | null>(null);
  const [cloudIdentity, setCloudIdentity] = useState<CloudIdentitySummary | null>(null);
  const [isLoading, setIsLoading] = useState(isRemoteAuthenticated);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!isRemoteAuthenticated) {
      setAccount(null);
      setCloudIdentity(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await service.getMyProfile();
    if (!result.ok) {
      setAccount(null);
      setCloudIdentity(null);
      setError(presentErrorMessage(result.error));
      setIsLoading(false);
      return;
    }

    setAccount(result.data.account.toDTO());
    setCloudIdentity(result.data.cloudIdentity);
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, [isRemoteAuthenticated]);

  async function refresh() {
    await load();
  }

  const loginEmail = cloudIdentity?.email ?? currentIdentity?.email ?? null;
  const isEmailVerified = cloudIdentity?.emailVerified ?? currentIdentity?.emailVerified ?? false;

  return {
    account,
    loginEmail,
    isEmailVerified,
    error,
    isLoading,
    isRemoteAuthenticated,
    refresh,
  };
}
