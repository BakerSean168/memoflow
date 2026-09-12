import { inject, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Result } from '@memoflow/contracts/result';
import type { GetGoalAggregateRes, KeyResultClientDTO } from '@memoflow/contracts/goal';
import { GOAL_SERVICE_KEY, DESKTOP_AUTH_API_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import type {
  GoalBindingOption,
  KeyResultBindingOption,
  TaskGoalBindingDisplay,
  TaskGoalBindingViewModel,
} from '../components/types';
import { executeDesktopAuthenticatedResult } from '../../../shared/utils/execute-desktop-authenticated-result';

type GoalOptionDTO = {
  id: string;
  name?: string;
  title?: string;
  summary?: string | null;
  status?: string;
};

type GoalLike = { toDTO?: () => GoalOptionDTO } | GoalOptionDTO;

function toPlainObject<T extends object>(value: T | { toDTO?: () => T }): T {
  if (value && typeof (value as { toDTO?: () => T }).toDTO === 'function') {
    return (value as { toDTO: () => T }).toDTO();
  }

  return value as T;
}

function mapGoalOption(goal: GoalLike): GoalBindingOption {
  const dto = toPlainObject(goal);

  return {
    id: String(dto.id),
    title: String(dto.name ?? dto.title ?? ''),
    description: dto.summary ?? undefined,
    status: dto.status ?? undefined,
  };
}

function mapKeyResultOption(dto: KeyResultClientDTO): KeyResultBindingOption {
  const { initialValue, currentValue: current, targetValue: target } = dto.progress;
  const range = target - initialValue;
  const percentage =
    range === 0
      ? current >= target
        ? 100
        : 0
      : Math.min(100, Math.max(0, Math.round(((current - initialValue) / range) * 100)));

  return {
    id: String(dto.id),
    title: dto.title,
    weight: dto.weight,
    progress: {
      current,
      target,
      percentage,
    },
  };
}

const GOAL_BINDING_PAGE_SIZE = 100;

export function useTaskGoalBindingOptions() {
  const goalService = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
  const desktopApi = inject(DESKTOP_AUTH_API_KEY, undefined);
  const { t } = useI18n();

  const goals = ref<GoalBindingOption[]>([]);
  const keyResultsByGoal = ref<Record<string, KeyResultBindingOption[]>>({});
  const loadingGoals = ref(false);
  const loadingKeyResults = ref<Record<string, boolean>>({});
  const keyResultErrorsByGoal = ref<Record<string, string | null>>({});
  const loadError = ref<string | null>(null);
  const inFlightAggregates = new Map<
    string,
    Promise<{ goal: GoalBindingOption; keyResults: KeyResultBindingOption[] } | undefined>
  >();

  async function executeGoalBindingOperation<T>(
    operation: () => Promise<Result<T>>,
    fallbackKey: string,
  ): Promise<Result<T>> {
    return executeDesktopAuthenticatedResult({
      operation,
      logScope: 'TaskGoalBindingOptions',
      t,
      fallbackKey,
      desktopApi,
      onError: (error, translatedMessage) => {
        loadError.value = translatedMessage;
        console.error('[TaskGoalBindingOptions] operation failed', error);
      },
    });
  }

  async function loadGoals(force = false): Promise<GoalBindingOption[]> {
    if (!force && goals.value.length > 0) {
      return goals.value;
    }

    loadingGoals.value = true;
    loadError.value = null;

    try {
      const collectedGoals: GoalBindingOption[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const listParams = {
          page,
          pageSize: GOAL_BINDING_PAGE_SIZE,
          systemView: 'active' as const,
        };
        const result = await executeGoalBindingOperation(
          () => goalService.listGoals(listParams),
          'goal.error.loadListFailed',
        );

        if (!result.ok) {
          goals.value = [];
          return [];
        }

        collectedGoals.push(...result.data.goals.map((goal: GoalLike) => mapGoalOption(goal)));

        const pagination = result.data.pagination;
        hasMore = Boolean(pagination?.hasMore);
        page += 1;
      }

      goals.value = collectedGoals;
      return goals.value;
    } finally {
      loadingGoals.value = false;
    }
  }

  async function requestGoalAggregate(
    goalId: string,
  ): Promise<{ goal: GoalBindingOption; keyResults: KeyResultBindingOption[] } | undefined> {
    keyResultErrorsByGoal.value = {
      ...keyResultErrorsByGoal.value,
      [goalId]: null,
    };
    loadingKeyResults.value = {
      ...loadingKeyResults.value,
      [goalId]: true,
    };
    loadError.value = null;

    try {
      const result = await executeGoalBindingOperation(
        () => goalService.getGoalAggregateView(goalId),
        'goal.error.loadFailed',
      );

      if (!result.ok) {
        keyResultsByGoal.value = {
          ...keyResultsByGoal.value,
          [goalId]: [],
        };
        keyResultErrorsByGoal.value = {
          ...keyResultErrorsByGoal.value,
          [goalId]: loadError.value ?? t('goal.error.loadKRFailed'),
        };
        return undefined;
      }

      const aggregate = result.data as GetGoalAggregateRes;
      const goal = mapGoalOption(aggregate.goal);
      const mapped = aggregate.keyResults.map(mapKeyResultOption);

      goals.value = [...goals.value.filter((option) => option.id !== goalId), goal];
      keyResultsByGoal.value = {
        ...keyResultsByGoal.value,
        [goalId]: mapped,
      };

      return { goal, keyResults: mapped };
    } catch (error) {
      const message = t('goal.error.loadKRFailed');
      loadError.value = message;
      keyResultsByGoal.value = {
        ...keyResultsByGoal.value,
        [goalId]: [],
      };
      keyResultErrorsByGoal.value = {
        ...keyResultErrorsByGoal.value,
        [goalId]: message,
      };
      console.error('[TaskGoalBindingOptions] failed to load key results', error);
      return undefined;
    } finally {
      loadingKeyResults.value = {
        ...loadingKeyResults.value,
        [goalId]: false,
      };
    }
  }

  function loadGoalAggregate(
    goalId: string,
    force = false,
  ): Promise<{ goal: GoalBindingOption; keyResults: KeyResultBindingOption[] } | undefined> {
    if (!goalId) return Promise.resolve(undefined);

    const cachedGoal = goals.value.find((goal) => goal.id === goalId);
    const hasCachedKeyResults = Object.prototype.hasOwnProperty.call(
      keyResultsByGoal.value,
      goalId,
    );
    if (!force && cachedGoal && hasCachedKeyResults) {
      return Promise.resolve({
        goal: cachedGoal,
        keyResults: keyResultsByGoal.value[goalId] ?? [],
      });
    }

    const pending = inFlightAggregates.get(goalId);
    if (pending) return pending;

    const request = requestGoalAggregate(goalId).finally(() => {
      if (inFlightAggregates.get(goalId) === request) {
        inFlightAggregates.delete(goalId);
      }
    });
    inFlightAggregates.set(goalId, request);
    return request;
  }

  async function loadGoal(goalId: string, force = false): Promise<GoalBindingOption | undefined> {
    return (await loadGoalAggregate(goalId, force))?.goal;
  }

  function loadKeyResults(goalId: string, force = false): Promise<KeyResultBindingOption[]> {
    if (!goalId) {
      return Promise.resolve([]);
    }

    return loadGoalAggregate(goalId, force).then((loaded) => loaded?.keyResults ?? []);
  }

  async function loadGoalBinding(goalId: string): Promise<void> {
    await loadGoalAggregate(goalId);
  }

  async function loadGoalBindings(goalIds: Array<string | null | undefined>): Promise<void> {
    const uniqueGoalIds = [...new Set(goalIds.filter((goalId): goalId is string => !!goalId))];
    await Promise.all(uniqueGoalIds.map((goalId) => loadGoalBinding(goalId)));
  }

  function clearErrors(): void {
    loadError.value = null;
    keyResultErrorsByGoal.value = {};
  }

  function resolveGoalBinding(
    binding: TaskGoalBindingViewModel | null | undefined,
  ): TaskGoalBindingDisplay | null {
    if (!binding) {
      return null;
    }

    const goal = goals.value.find((option) => option.id === binding.goalId);
    const keyResult = binding.goalId
      ? keyResultsByGoal.value[binding.goalId]?.find((option) => option.id === binding.keyResultId)
      : undefined;

    return {
      goalName: goal?.title ?? t('common.unavailable'),
      keyResultName: keyResult?.title ?? t('common.unavailable'),
    };
  }

  return {
    goals,
    keyResultsByGoal,
    loadingGoals,
    loadingKeyResults,
    keyResultErrorsByGoal,
    loadError,
    loadGoals,
    loadGoal,
    loadKeyResults,
    loadGoalBinding,
    loadGoalBindings,
    clearErrors,
    resolveGoalBinding,
  };
}
