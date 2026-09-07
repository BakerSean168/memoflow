import { useEffect, useState } from 'react';

import type { ReminderTemplateClientDTO, ReminderTodayScheduleItem } from '@memoflow/contracts/reminder';
import { presentErrorMessage } from '@memoflow/http-client';

import { useAppSession } from './useAppSession';
import { useReminderService } from './useReminderService';

export function useReminders() {
  const service = useReminderService();
  const { isRemoteAuthenticated } = useAppSession();
  const [templates, setTemplates] = useState<ReminderTemplateClientDTO[]>([]);
  const [todaySchedule, setTodaySchedule] = useState<ReminderTodayScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(isRemoteAuthenticated);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!isRemoteAuthenticated) {
      setTemplates([]);
      setTodaySchedule([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const [templateResult, scheduleResult] = await Promise.all([
      service.getReminderTemplates(),
      service.getTodaySchedule({ limit: 20, includeExpired: false }),
    ]);

    if (!templateResult.ok) {
      setTemplates([]);
      setTodaySchedule([]);
      setError(presentErrorMessage(templateResult.error));
      setIsLoading(false);
      return;
    }

    if (!scheduleResult.ok) {
      setTemplates(templateResult.data.templates);
      setTodaySchedule([]);
      setError(presentErrorMessage(scheduleResult.error));
      setIsLoading(false);
      return;
    }

    setTemplates(templateResult.data.templates);
    setTodaySchedule(scheduleResult.data.data);
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, [isRemoteAuthenticated]);

  async function refresh() {
    await load();
  }

  async function toggleTemplateEnabled(id: string) {
    const result = await service.toggleTemplateEnabled(id);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return false;
    }

    await load();
    return true;
  }

  return {
    error,
    isLoading,
    isRemoteAuthenticated,
    refresh,
    templates,
    todaySchedule,
    toggleTemplateEnabled,
  };
}
