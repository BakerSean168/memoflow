export interface AIPlannerCalendarItem {
  readonly id: string;
  readonly title: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly hasConflict: boolean;
  readonly conflictingEntryIds: readonly string[];
}

export interface AIPlannerTaskItem {
  readonly id: string;
  readonly templateId: string;
  readonly title: string;
  readonly instanceDate: number;
  readonly dueDate: number | null;
  readonly status: string;
}

export interface AIPlannerWindowSummary {
  readonly startTime: number;
  readonly endTime: number;
  readonly calendar: readonly AIPlannerCalendarItem[];
  readonly tasks: readonly AIPlannerTaskItem[];
}

export interface AIPlannerConflictSummary {
  readonly startTime: number;
  readonly endTime: number;
  readonly entries: readonly AIPlannerCalendarItem[];
  readonly conflictCount: number;
}

/** Read-only Planner/Task projection for the assistant. Never exposes Scheduler worker state. */
export interface IAIPlannerReadPort {
  getWindowSummary(input: {
    readonly identityId: string;
    readonly startTime: number;
    readonly endTime: number;
  }): Promise<AIPlannerWindowSummary>;
  getConflicts(input: {
    readonly identityId: string;
    readonly startTime: number;
    readonly endTime: number;
  }): Promise<AIPlannerConflictSummary>;
  getUpcomingTasks(input: {
    readonly identityId: string;
    readonly startTime: number;
    readonly endTime: number;
    readonly limit?: number;
  }): Promise<readonly AIPlannerTaskItem[]>;
}
