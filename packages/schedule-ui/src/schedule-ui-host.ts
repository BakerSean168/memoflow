import type { Component, InjectionKey, Ref } from 'vue';
import type { QueryClient } from '@tanstack/vue-query';
import type { Result } from '@memoflow/transport-contracts/result';
import type { GoalClientDTO } from '@memoflow/goal-contracts';
import type { RoutineUpcomingOccurrence } from '@memoflow/routine-contracts';
import type {
  RescheduleTaskInput,
  TaskOccurrenceClientDTO,
  TaskPlanClientDTO,
} from '@memoflow/task-contracts';
import type { ScheduleClientPort } from '@memoflow/schedule-client';
import type { PlatformRendererHost } from '@memoflow/ui-host-contracts';

/** Panel transition status; single declaration lives in the platform contract. */
export type { PanelSurfaceStatus } from '@memoflow/ui-host-contracts';

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

/**
 * Renderer composition dependencies. Platform capabilities come from
 * {@link PlatformRendererHost}; this port only declares the Schedule slots.
 */
export interface ScheduleUiHost extends PlatformRendererHost {
  SCHEDULE_SERVICE_KEY: InjectionKey<ScheduleClientPort>;
  GOAL_SERVICE_KEY: InjectionKey<ScheduleGoalPort>;
  ROUTINE_SERVICE_KEY: InjectionKey<RoutineUpcomingSourcePort>;

  scheduleCalendarQueryKeys: { entries(identityScope: string): readonly unknown[] };
  plannerOwnerQueryKeys: { goals(identityScope: string): readonly unknown[] };
  SCHEDULE_CALENDAR_STALE_TIME_MS: number;
  PLANNER_OWNER_STALE_TIME_MS: number;

  useTask(): ScheduleTaskPlannerPort;
  fetchRoutineUpcomingCached(
    options: FetchRoutineUpcomingCachedOptions,
  ): Promise<RoutineUpcomingOccurrence[]>;

  startOfDayMs(ms: number): number;
  endOfDayMs(ms: number): number;

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
}

// Bound once in the renderer composition root. The host retains DI, cache,
// locale and platform ownership; Schedule surfaces only consume this port.
export let scheduleUiHost: ScheduleUiHost;
export function bindScheduleUiHost(host: ScheduleUiHost): void {
  scheduleUiHost = host;
}
