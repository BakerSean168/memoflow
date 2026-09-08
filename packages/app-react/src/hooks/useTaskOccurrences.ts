import { useEffect, useState } from 'react';

import type { TaskOccurrenceStatus, TaskTimeConfigDTO } from '@memoflow/contracts/task';
import type { TaskOccurrence } from '@memoflow/task/client';
import { presentErrorMessage } from '@memoflow/http-client';

import { useAppSession } from './useAppSession';
import { useTaskService } from './useTaskService';

export type TaskOccurrenceSummary = {
  id: string;
  templateId: string;
  instanceDate: number;
  status: TaskOccurrenceStatus;
  timeConfig: TaskTimeConfigDTO;
  actualStartTime: number | null;
  actualEndTime: number | null;
  comment: string | null;
};

function mapInstance(instance: TaskOccurrence): TaskOccurrenceSummary {
  return {
    id: String(instance.id),
    templateId: String(instance.templateId),
    instanceDate: instance.instanceDate,
    status: instance.status,
    timeConfig: {
      timeType: instance.timeConfig.timeType,
      startDate: instance.timeConfig.startDate ? instance.timeConfig.startDate : null,
      timePoint: instance.timeConfig.timePoint,
      timeRange: instance.timeConfig.timeRange ?? null,
    },
    actualStartTime: instance.actualStartTime ?? null,
    actualEndTime: instance.actualEndTime ?? null,
    comment: instance.comment,
  };
}

export function useTaskOccurrences(taskId: string | null) {
  const service = useTaskService();
  const { isRemoteAuthenticated } = useAppSession();
  const [instances, setInstances] = useState<TaskOccurrenceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!isRemoteAuthenticated || !taskId) {
      setInstances([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await service.listInstances({ templateId: taskId, limit: 20 });
    if (!result.ok) {
      setInstances([]);
      setError(presentErrorMessage(result.error));
      setIsLoading(false);
      return;
    }

    const sorted = result.data
      .map((instance) => mapInstance(instance))
      .sort((left, right) => right.instanceDate - left.instanceDate);
    setInstances(sorted);
    setIsLoading(false);
  }

  useEffect(() => {
    void load();
  }, [isRemoteAuthenticated, taskId]);

  async function refresh() {
    await load();
  }

  async function startInstance(id: string) {
    const result = await service.startInstance(id);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return false;
    }

    await load();
    return true;
  }

  async function completeInstance(id: string) {
    const result = await service.completeInstance(id);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return false;
    }

    await load();
    return true;
  }

  async function skipInstance(id: string) {
    const result = await service.skipInstance(id);
    if (!result.ok) {
      setError(presentErrorMessage(result.error));
      return false;
    }

    await load();
    return true;
  }

  return {
    completeInstance,
    error,
    instances,
    isLoading,
    refresh,
    skipInstance,
    startInstance,
  };
}
