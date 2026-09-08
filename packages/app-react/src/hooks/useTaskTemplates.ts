import { useEffect, useMemo, useState } from 'react';

import type { ImportanceLevel } from '@memoflow/contracts/shared';
import type { LabelClientDTO } from '@memoflow/contracts/label';
import type {
  TaskTemplateClientDTO,
  TaskTemplateStatus,
  TaskTimeConfigDTO,
} from '@memoflow/contracts/task';
import type { TaskTemplate } from '@memoflow/task/client';
import { presentErrorMessage } from '@memoflow/http-client';

import { useAppSession } from './useAppSession';
import { useTaskService } from './useTaskService';

export type TaskTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  status: TaskTemplateStatus;
  outcome: TaskTemplateClientDTO['outcome'];
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
  singleInstanceStatus: TaskTemplateClientDTO['singleInstanceStatus'];
  labels: LabelClientDTO[];
  updatedAt: number;
};

export type TaskStatusFilter = 'all' | TaskTemplateStatus;
export type TaskSortOption = 'updated' | 'pending' | 'completion';

export type TaskTemplateDetail = TaskTemplateSummary & {
  createdAt: number;
  startDate: number | null;
  dueDate: number | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  comment: string | null;
  timeConfig: TaskTimeConfigDTO;
};

function mapTemplate(template: TaskTemplate): TaskTemplateSummary {
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
  };
}

export function mapTaskTemplateDetail(template: TaskTemplate): TaskTemplateDetail {
  return {
    ...mapTemplate(template),
    createdAt: template.createdAt,
    startDate: template.startDate ?? null,
    dueDate: template.dueDate ?? null,
    estimatedMinutes: template.estimatedMinutes,
    actualMinutes: template.actualMinutes,
    comment: template.comment,
    timeConfig: {
      timeType: template.timeConfig.timeType,
      startDate: template.timeConfig.startDate ?? null,
      timePoint: template.timeConfig.timePoint,
      timeRange: template.timeConfig.timeRange ?? null,
    },
  };
}

function sortTemplates(templates: TaskTemplateSummary[], sortBy: TaskSortOption) {
  const next = [...templates];
  next.sort((left, right) => {
    if (sortBy === 'pending') {
      return right.pendingInstanceCount - left.pendingInstanceCount || right.updatedAt - left.updatedAt;
    }
    if (sortBy === 'completion') {
      return right.completionRate - left.completionRate || right.updatedAt - left.updatedAt;
    }
    return right.updatedAt - left.updatedAt;
  });
  return next;
}

export function useTaskTemplates() {
  const service = useTaskService();
  const { isRemoteAuthenticated } = useAppSession();

  const [templates, setTemplates] = useState<TaskTemplateSummary[]>([]);
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
  }, [isRemoteAuthenticated, service, statusFilter]);

  async function refresh() {
    if (!isRemoteAuthenticated) return;
    setIsLoading(true);
    await fetchTemplates(statusFilter);
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredTemplates = useMemo(() => {
    const byQuery =
      normalizedQuery.length === 0
        ? templates
        : templates.filter((template) =>
            [template.name, template.description ?? '', template.labels.map((label) => label.name).join(' ')]
              .join(' ')
              .toLowerCase()
              .includes(normalizedQuery),
          );
    return sortTemplates(byQuery, sortBy);
  }, [normalizedQuery, sortBy, templates]);

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
