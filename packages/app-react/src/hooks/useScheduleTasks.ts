import { useEffect, useState } from 'react';

import type { ScheduleTaskStatus, SourceModule, TaskPriority } from '@memoflow/contracts/schedule';
import type { ScheduleTask } from '@memoflow/scheduler/client';
import { presentErrorMessage } from '@memoflow/http-client';

import { useAppSession } from './useAppSession';
import { useSchedulerService } from './useSchedulerService';

export type ScheduleTaskSummary = {
  id: string;
  name: string;
  description: string | null;
  status: ScheduleTaskStatus;
  sourceModule: SourceModule;
  enabled: boolean;
  priority: TaskPriority;
  tags: string[];
  nextRunAt: number | null;
  lastRunAt: number | null;
  executionCount: number;
  consecutiveFailures: number;
  isOverdue: boolean;
};

export type ScheduleStatusFilter = 'all' | ScheduleTaskStatus;

function mapScheduleTask(task: ScheduleTask): ScheduleTaskSummary {
  return {
    id: String(task.id),
    name: task.name,
    description: task.description,
    status: task.status,
    sourceModule: task.sourceModule,
    enabled: task.enabled,
    priority: task.metadata.priority,
    tags: task.metadata.tags,
    nextRunAt: task.execution.nextRunAt?.getTime() ?? null,
    lastRunAt: task.execution.lastRunAt?.getTime() ?? null,
    executionCount: task.execution.executionCount,
    consecutiveFailures: task.execution.consecutiveFailures,
    isOverdue:
      task.execution.nextRunAt !== null &&
      task.execution.nextRunAt.getTime() < Date.now() &&
      task.status !== 'Completed' &&
      task.status !== 'Cancelled',
  };
}

export function useScheduleTasks() {
  const service = useSchedulerService();
  const { isRemoteAuthenticated } = useAppSession();

  const [tasks, setTasks] = useState<ScheduleTaskSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ScheduleStatusFilter>('all');

  useEffect(() => {
    if (!isRemoteAuthenticated) {
      setTasks([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadTasks() {
      setIsLoading(true);
      setError(null);

      const result = await service.getTasks();
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setTasks([]);
        setError(presentErrorMessage(result.error));
        setIsLoading(false);
        return;
      }

      setTasks(result.data.map((task) => mapScheduleTask(task)));
      setIsLoading(false);
    }

    void loadTasks();

    return () => {
      cancelled = true;
    };
  }, [isRemoteAuthenticated, service]);

  async function refresh() {
    if (!isRemoteAuthenticated) {
      return;
    }

    setIsLoading(true);
    const result = await service.getTasks();
    if (!result.ok) {
      setTasks([]);
      setError(presentErrorMessage(result.error));
      setIsLoading(false);
      return;
    }

    setTasks(result.data.map((task) => mapScheduleTask(task)));
    setError(null);
    setIsLoading(false);
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredTasks = tasks.filter((task) => {
    if (statusFilter !== 'all' && task.status !== statusFilter) {
      return false;
    }

    if (normalizedQuery.length === 0) {
      return true;
    }

    const text = [task.name, task.description ?? '', task.sourceModule, task.tags.join(' ')].join(' ').toLowerCase();
    return text.includes(normalizedQuery);
  });

  return {
    error,
    filteredTasks,
    isLoading,
    isRemoteAuthenticated,
    refresh,
    searchQuery,
    setSearchQuery,
    setStatusFilter,
    statusFilter,
    tasks,
  };
}
