import type { AIWorkflowRunView, GoalWorkflowLiveActionRecord } from '@memoflow/ai-contracts';

export interface GoalWorkflowChange {
  eventId: string;
  sequence: number;
  resourceVersion: number;
  run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>;
  actions: GoalWorkflowLiveActionRecord[];
  baseActionSequence: number;
  lastActionSequence: number;
}

/** A committed read projection; it never grants workflow or Goal write authority. */
export interface GoalWorkflowEventSource {
  init(): Promise<void>;
  readonly epoch: string;
  head(identityId: string): Promise<{ first: number; last: number }>;
  read(identityId: string, after: number): Promise<GoalWorkflowChange[]>;
  snapshot(
    identityId: string,
    runId: string,
  ): Promise<Extract<AIWorkflowRunView, { kind: 'goal.create' }> | null>;
  subscribe(wake: () => void): () => void;
  dispose(): Promise<void>;
}
