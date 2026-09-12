import { useEffect, useMemo, useState } from 'react';

import { compareGoalTimeframesByEnd } from '@memoflow/contracts/goal';
import type {
  GoalAggregateReadModel,
  GoalClientDTO,
  GoalStatus,
  GoalTimeframe,
  KeyResultClientDTO,
} from '@memoflow/contracts/goal';
import type { Goal } from '@memoflow/goal/client';
import type { Ymd } from '@memoflow/contracts/primitives';
import { presentErrorMessage } from '@memoflow/http-client';

import { useAppSession } from './useAppSession';
import { useGoalService } from './useGoalService';

export type GoalSummary = {
  id: string;
  version: number;
  name: string;
  summary: string | null;
  status: GoalStatus;
  startDate: Ymd | null;
  target: GoalTimeframe | null;
  archivedAt: number | null;
  updatedAt: number;
  labels: GoalClientDTO['labels'];
  totalKeyResults: number;
  completedKeyResults: number;
  overallProgress: number;
};

export type GoalStatusFilter = 'all' | GoalStatus;
export type GoalSortField = 'progress' | 'target' | 'updatedAt';
export type GoalSortDirection = 'asc' | 'desc';

export interface GoalSortOption {
  field: GoalSortField;
  direction: GoalSortDirection;
}

export type GoalDetail = GoalSummary & {
  keyResults: Array<{
    id: string;
    title: string;
    description: string | null;
    currentValue: number;
    targetValue: number;
    initialValue: number;
    unit: string | null;
    progress: number;
  }>;
  reviewsCount: number;
};

function progressPercentage(keyResult: KeyResultClientDTO): number {
  return keyResult.progressPercentage;
}

function mapGoalDTO(dto: GoalClientDTO): GoalSummary {
  return {
    id: String(dto.id),
    version: dto.version,
    name: dto.name,
    summary: dto.summary,
    status: dto.status,
    startDate: dto.startDate,
    target: dto.target,
    archivedAt: dto.archivedAt,
    updatedAt: dto.updatedAt,
    labels: dto.labels,
    totalKeyResults: dto.totalKeyResults,
    completedKeyResults: dto.completedKeyResults,
    overallProgress: dto.overallProgress,
  };
}

function mapGoal(goal: Goal): GoalSummary {
  return mapGoalDTO(goal.toDTO());
}

export function mapGoalDetail(goal: GoalAggregateReadModel): GoalDetail {
  return {
    ...mapGoalDTO(goal),
    keyResults: goal.keyResults.map((item) => ({
      id: String(item.id),
      title: item.title,
      description: item.description,
      currentValue: item.progress.currentValue,
      targetValue: item.progress.targetValue,
      initialValue: item.progress.initialValue,
      unit: item.progress.unit,
      progress: progressPercentage(item),
    })),
    reviewsCount: goal.reviews.length,
  };
}

export function useGoals() {
  const service = useGoalService();
  const { isRemoteAuthenticated } = useAppSession();

  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<GoalStatusFilter>('all');
  const [sortOption, setSortOption] = useState<GoalSortOption>({
    field: 'updatedAt',
    direction: 'desc',
  });

  useEffect(() => {
    if (!isRemoteAuthenticated) {
      setGoals([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadGoals() {
      setIsLoading(true);
      setError(null);

      const result = await service.listGoals({
        page: 1,
        pageSize: 60,
        status: statusFilter === 'all' ? undefined : [statusFilter],
      });

      if (cancelled) return;

      if (!result.ok) {
        setGoals([]);
        setError(presentErrorMessage(result.error));
        setIsLoading(false);
        return;
      }

      setGoals(result.data.goals.map(mapGoal));
      setIsLoading(false);
    }

    void loadGoals();
    return () => {
      cancelled = true;
    };
  }, [isRemoteAuthenticated, service, statusFilter]);

  async function refresh() {
    if (!isRemoteAuthenticated) return;

    setIsLoading(true);
    const result = await service.listGoals({
      page: 1,
      pageSize: 60,
      status: statusFilter === 'all' ? undefined : [statusFilter],
    });

    if (!result.ok) {
      setGoals([]);
      setError(presentErrorMessage(result.error));
      setIsLoading(false);
      return;
    }

    setGoals(result.data.goals.map(mapGoal));
    setError(null);
    setIsLoading(false);
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredGoals = useMemo(() => {
    let result = goals;

    if (normalizedQuery.length > 0) {
      result = result.filter((goal) => {
        const text = [goal.name, goal.summary ?? '', ...goal.labels.map((label) => label.name)]
          .join(' ')
          .toLowerCase();
        return text.includes(normalizedQuery);
      });
    }

    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (sortOption.field) {
        case 'progress':
          comparison = a.overallProgress - b.overallProgress;
          break;
        case 'target':
          comparison = compareGoalTimeframesByEnd(a.target, b.target);
          break;
        case 'updatedAt':
          comparison = a.updatedAt - b.updatedAt;
          break;
      }
      return sortOption.direction === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [goals, normalizedQuery, sortOption]);

  return {
    error,
    filteredGoals,
    goals,
    isLoading,
    isRemoteAuthenticated,
    refresh,
    searchQuery,
    setSearchQuery,
    setSortOption,
    setStatusFilter,
    sortOption,
    statusFilter,
  };
}
