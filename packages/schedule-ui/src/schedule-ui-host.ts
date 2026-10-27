import type { Component, InjectionKey, MaybeRefOrGetter, ObjectDirective, Ref } from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
import type { TimeFacade } from '@memoflow/time';
import type { Result } from '@memoflow/contracts/result';
import type { GoalClientDTO } from '@memoflow/goal-contracts';
import type {
  RescheduleTaskInput,
  TaskOccurrenceClientDTO,
  TaskPlanClientDTO,
} from '@memoflow/task-contracts';
import type { ScheduleClientPort } from '@memoflow/schedule-client';

export type PanelSurfaceStatus = 'clean' | 'dirty' | 'busy';

/** Narrow Goal read/command seam consumed by the Planner calendar. */
export interface ScheduleGoalPort {
  listGoals(params?: {
    page?: number;
    pageSize?: number;
    query?: string;
    status?: string[];
    systemView?: string;
    labelIdsAll?: string[];
  }): Promise<
    Result<{
      goals: ReadonlyArray<GoalClientDTO>;
      pagination?: { hasMore?: boolean };
    }>
  >;
  updateGoal(id: string, request: unknown): Promise<Result<unknown>>;
}

/** Task facade subset consumed by the Planner calendar and owner commands. */
export interface ScheduleTaskPlannerPort {
  instances: Readonly<Ref<TaskOccurrenceClientDTO[]>>;
  templates: Readonly<Ref<TaskPlanClientDTO[]>>;
  isLoading: Readonly<Ref<boolean>>;
  error: Readonly<Ref<unknown>>;
  fetchInstancesByDateRange(
    start: number,
    end: number,
    options?: { force?: boolean },
  ): Promise<unknown>;
  fetchTemplates(query?: { page?: number; limit?: number }): Promise<unknown>;
  rescheduleOccurrence(
    id: string,
    request: RescheduleTaskInput,
    options?: { suppressErrorReport?: boolean },
  ): Promise<Result<unknown>>;
}

export interface RoutineUpcomingOccurrence {
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly title: string;
  readonly description?: string | null;
  readonly occurrenceAt: number;
  readonly endAt?: number | null;
  readonly revision: number;
}

/** Narrow Routine read seam consumed by the Planner calendar. */
export interface RoutineUpcomingSourcePort {
  getUpcomingOccurrences(input: {
    start: number;
    end: number;
    limit: number;
  }): Promise<Result<{ occurrences: RoutineUpcomingOccurrence[] }>>;
}

export interface FetchRoutineUpcomingCachedOptions {
  queryClient: QueryClient;
  identityScope: string;
  service: RoutineUpcomingSourcePort;
  start: number;
  end: number;
  limit: number;
  force?: boolean;
}

export interface ScheduleUiHost {
  SCHEDULE_SERVICE_KEY: InjectionKey<ScheduleClientPort>;
  GOAL_SERVICE_KEY: InjectionKey<ScheduleGoalPort>;
  ROUTINE_SERVICE_KEY: InjectionKey<RoutineUpcomingSourcePort>;

  useStrictInject<T>(key: InjectionKey<T>, name?: string): T;
  sanitizeForIpc<T>(value: T): T;
  createComposableHandleError(options: {
    t: (key: string, params?: Record<string, unknown>) => string;
    setError(message: string | null): void;
    report?(message: string): void;
  }): (error: unknown, fallbackKey: string) => void;
  useDialogCloseGuard(options: {
    dirty: MaybeRefOrGetter<boolean>;
    busy?: MaybeRefOrGetter<boolean>;
    onClose(): void | Promise<void>;
  }): { confirming: Ref<boolean>; requestClose(): Promise<boolean> };

  useServerStateRuntime(): { queryClient: QueryClient };
  useServerStateIdentityScope(): () => string;
  scheduleCalendarQueryKeys: { entries(identityScope: string): readonly unknown[] };
  plannerOwnerQueryKeys: { goals(identityScope: string): readonly unknown[] };
  SCHEDULE_CALENDAR_STALE_TIME_MS: number;
  PLANNER_OWNER_STALE_TIME_MS: number;

  useTask(): ScheduleTaskPlannerPort;
  fetchRoutineUpcomingCached(
    options: FetchRoutineUpcomingCachedOptions,
  ): Promise<RoutineUpcomingOccurrence[]>;

  usePanelWidth(): { isNarrow: Readonly<Ref<boolean>> };
  usePanelSurfaceStatus(status: Ref<PanelSurfaceStatus>): void;

  getProductTime(): TimeFacade;
  productTimeRevision: Readonly<Ref<number>>;
  startOfDayMs(ms: number): number;
  endOfDayMs(ms: number): number;
  formatProductDateTime(value: number | null | undefined): string;

  components: Record<
    | 'ProductSurfaceHeader'
    | 'ResponsivePrimaryAction'
    | 'ProductDialogShell'
    | 'ProductDatePicker'
    | 'ProductDateTimePicker'
    | 'ProductEditorFrame'
    | 'ProductInlineValidation'
    | 'ProductPropertyChip'
    | 'TaskOccurrenceQuickSurface',
    Component
  >;
  vKeyboardList: ObjectDirective<HTMLElement>;
}

// Bound once in the renderer composition root. The host retains DI, cache,
// locale and platform ownership; Schedule surfaces only consume this port.
export let scheduleUiHost: ScheduleUiHost;
export function bindScheduleUiHost(host: ScheduleUiHost): void {
  scheduleUiHost = host;
}
