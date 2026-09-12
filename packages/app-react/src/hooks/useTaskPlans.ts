import { useEffect, useMemo, useState } from 'react';

import type { ImportanceLevel } from '@memoflow/contracts/shared';
import type { GoalId } from '@memoflow/contracts/primitives';
import type { LabelClientDTO } from '@memoflow/contracts/label';
import type { TaskPlanClientDTO, TaskPlanStatus, TaskPlanSchedule } from '@memoflow/contracts/task';
import type { TaskPlan } from '@memoflow/task/client';
import { presentErrorMessage } from '@memoflow/http-client';

import { useAppSession } from './useAppSession';
import { useTaskService } from './useTaskService';

export type TaskPlanSummary = {
  id: string;
  name: string;
  description: string | null;
  status: TaskPlanStatus;
  outcome: TaskPlanClientDTO['outcome'];
  archivedAt: number | null;
  importance: ImportanceLevel;
  instanceCount: number;
  completedInstanceCount: number;
  pendingInstanceCount: number;
  completionRate: number;
  dueInstanceCount: number;
  completedDueInstanceCount: number;
  completionWindowDays: 30;
  futurePendingInstanceCount: number;
  singleInstanceStatus: TaskPlanClientDTO['singleInstanceStatus'];
  labels: LabelClientDTO[];
  updatedAt: number;
  goalBinding: TaskPlanClientDTO['goalBinding'];
};

export type TaskStatusFilter = 'all' | TaskPlanStatus;
export type TaskSortOption = 'updated' | 'pending' | 'completion';

export type TaskPlanDetail = TaskPlanSummary & {
  createdAt: number;
  schedule: TaskPlanSchedule;
};

function mapTemplate(template: TaskPlan): TaskPlanSummary {
  return {
    id: String(template.id),
    name: template.name,
    description: template.description,
    status: template.status,
    outcome: template.outcome,
    archivedAt: template.archivedAt,
    importance: template.importance,
    instanceCount: template.instanceCount,
    completedInstanceCount: template.completedInstanceCount,
    pendingInstanceCount: template.pendingInstanceCount,
    completionRate: template.completionRate,
    dueInstanceCount: template.dueInstanceCount,
    completedDueInstanceCount: template.completedDueInstanceCount,
    completionWindowDays: template.completionWindowDays,
    futurePendingInstanceCount: template.futurePendingInstanceCount,
    singleInstanceStatus: template.singleInstanceStatus,
    labels: template.labels,
    updatedAt: template.updatedAt,
    goalBinding: template.goalBinding ? { ...template.goalBinding } : null,
  };
}

export function mapTaskPlanDetail(template: TaskPlan): TaskPlanDetail {
  return {
    ...mapTemplate(template),
    createdAt: template.createdAt,
    schedule: structuredClone(template.schedule),
  };
}

function sortTemplates(templates: TaskPlanSummary[], sortBy: TaskSortOption) {
  const next = [...templates];
  next.sort((left, right) => {
    if (sortBy === 'pending') {
      return (
        right.pendingInstanceCount - left.pendingInstanceCount || right.updatedAt - left.updatedAt
      );
    }
    if (sortBy === 'completion') {
      return right.completionRate - left.completionRate || right.updatedAt - left.updatedAt;
    }
    return right.updatedAt - left.updatedAt;
  });
  return next;
}

export function useTaskPlans(
  options: { goalId?: string | null; keyResultId?: string | null } = {},
) {
  const service = useTaskService();
  const { isRemoteAuthenticated } = useAppSession();

  const [templates, setTemplates] = useState<TaskPlanSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('all');
  const [sortBy, setSortBy] = useState<TaskSortOption>('updated');

  async function fetchTemplates(filter: TaskStatusFilter) {
    const result = await service.listTemplates({
      page: 1,
      limit: 100,
      status: filter === 'all' ? undefined : [filter],
      ...(options.goalId ? { goalId: options.goalId as GoalId } : {}),
    });
    if (!result.ok) {
      setTemplates([]);
      setError(presentErrorMessage(result.error));
      setIsLoading(false);
      return;
    }
    setTemplates(result.data.templates.map(mapTemplate));
    setError(null);
    setIsLoading(false);
  }

  useEffect(() => {
    if (!isRemoteAuthenticated) {
      setTemplates([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    async function loadTemplates() {
      setIsLoading(true);
      const result = await service.listTemplates({
        page: 1,
        limit: 100,
        status: statusFilter === 'all' ? undefined : [statusFilter],
        ...(options.goalId ? { goalId: options.goalId as GoalId } : {}),
      });
      if (cancelled) return;
      if (!result.ok) {
        setTemplates([]);
        setError(presentErrorMessage(result.error));
        setIsLoading(false);
        return;
      }
      setTemplates(result.data.templates.map(mapTemplate));
      setError(null);
      setIsLoading(false);
    }
    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [isRemoteAuthenticated, options.goalId, service, statusFilter]);

  async function refresh() {
    if (!isRemoteAuthenticated) return;
    setIsLoading(true);
    await fetchTemplates(statusFilter);
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredTemplates = useMemo(() => {
    const byGoal = options.goalId
      ? templates.filter((template) => template.goalBinding?.goalId === options.goalId)
      : templates;
    const byKeyResult = options.keyResultId
      ? byGoal.filter((template) => template.goalBinding?.keyResultId === options.keyResultId)
      : byGoal;
    const byQuery =
      normalizedQuery.length === 0
        ? byKeyResult
        : byKeyResult.filter((template) =>
            [
              template.name,
              template.description ?? '',
              template.labels.map((label) => label.name).join(' '),
            ]
              .join(' ')
              .toLowerCase()
              .includes(normalizedQuery),
          );
    return sortTemplates(byQuery, sortBy);
  }, [normalizedQuery, options.goalId, options.keyResultId, sortBy, templates]);

  return {
    error,
    filteredTemplates,
    isLoading,
    isRemoteAuthenticated,
    refresh,
    searchQuery,
    setSearchQuery,
    setSortBy,
    setStatusFilter,
    sortBy,
    statusFilter,
    templates,
  };
}
