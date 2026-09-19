import type {
  CalendarEventProjection,
  PlannerConflictProjection,
} from '@memoflow/contracts/schedule';

export interface AIPlannerRange {
  readonly start: number;
  readonly end: number;
}

export interface AIPlannerWindowSummary {
  readonly range: AIPlannerRange;
  readonly projections: readonly CalendarEventProjection[];
  readonly conflicts: readonly PlannerConflictProjection[];
}

export interface AIPlannerConflictSummary {
  readonly range: AIPlannerRange;
  readonly conflicts: readonly PlannerConflictProjection[];
}

/** Read-only Planner owner projection for the assistant. */
export interface IAIPlannerReadPort {
  getWindowSummary(input: {
    readonly identityId: string;
    readonly range: AIPlannerRange;
  }): Promise<AIPlannerWindowSummary>;
  getConflicts(input: {
    readonly identityId: string;
    readonly range: AIPlannerRange;
  }): Promise<AIPlannerConflictSummary>;
  getUpcomingTasks(input: {
    readonly identityId: string;
    readonly range: AIPlannerRange;
    readonly limit?: number;
  }): Promise<readonly Extract<CalendarEventProjection, { sourceType: 'task' }>[]>;
}
