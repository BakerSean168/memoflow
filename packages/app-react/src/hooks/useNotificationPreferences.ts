import { useEffect, useState } from 'react';

import type {
  NotificationChannelType,
  NotificationPreferenceClientDTO,
} from '@memoflow/contracts/notification';
import { presentErrorMessage } from '@memoflow/http-client';

import { useAppSession } from './useAppSession';
import { useNotificationService } from './useNotificationService';

/** User-level NotificationPreference owner state. Device presentation/sound is intentionally absent. */
export function useNotificationPreferences() {
  const service = useNotificationService();
  const { isRemoteAuthenticated } = useAppSession();
  const [preference, setPreference] = useState<NotificationPreferenceClientDTO | null>(null);
  const [isLoading, setIsLoading] = useState(isRemoteAuthenticated);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    if (!isRemoteAuthenticated) {
      setPreference(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    const result = await service.getPreferences();
    setIsLoading(false);
    if (!result.ok) {
      setPreference(null);
      setError(presentErrorMessage(result.error));
      return;
    }
    setPreference(result.data);
  }

  useEffect(() => {
    void load();
  }, [isRemoteAuthenticated]);

  async function refresh(): Promise<void> {
    await load();
  }

  async function setGlobalChannel(
    channel: NotificationChannelType,
    enabled: boolean,
  ): Promise<boolean> {
    if (!preference) return false;
    setIsMutating(true);
    setError(null);
    const result = await service.updatePreferences({
      globalChannels: {
        ...preference.globalChannels,
        [channel]: enabled,
      },
    });
    setIsMutating(false);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return false;
    }
    setPreference(result.data);
    return true;
  }

  return {
    error,
    isLoading,
    isMutating,
    preference,
    refresh,
    setGlobalChannel,
  };
}
