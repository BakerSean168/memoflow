import type { MastraCompositeStore } from '@mastra/core/storage';
import type { GoalWorkflowEventSource } from '../../application/ports/goal-workflow-events.port';

const sources = new WeakMap<object, GoalWorkflowEventSource>();
export function registerGoalWorkflowEventSource(
  storage: MastraCompositeStore,
  source: GoalWorkflowEventSource,
): void {
  sources.set(storage, source);
}
export function getGoalWorkflowEventSource(storage: object): GoalWorkflowEventSource | undefined {
  return sources.get(storage);
}
