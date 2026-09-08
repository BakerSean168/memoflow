export type ProjectionRepairSource = 'task' | 'goal' | 'reminder' | 'routine';

export interface ProjectionRepairCounters {
  readonly repaired: number;
  readonly unchanged: number;
  readonly failed: number;
}

export interface ProjectionRepairMetricsSnapshot {
  readonly task: ProjectionRepairCounters;
  readonly goal: ProjectionRepairCounters;
  readonly reminder: ProjectionRepairCounters;
  readonly routine: ProjectionRepairCounters;
  readonly total: ProjectionRepairCounters;
}

/** Read-only cumulative counters for durable projection repair sweeps. */
export interface ProjectionRepairMetricsReader {
  snapshot(): ProjectionRepairMetricsSnapshot;
}
