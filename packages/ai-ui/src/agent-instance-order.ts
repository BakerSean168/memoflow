import type { AgentDriverKind, AgentInstance } from '@memoflow/ai-contracts';

/** Fixed Desktop grouping, independent of enabled/probe state or display name. */
const DRIVER_ORDER: readonly AgentDriverKind[] = [
  'codex',
  'claude',
  'pi',
  'dsh',
  'antigravity',
  'mastra',
];

export function sortAgentInstances(instances: readonly AgentInstance[]): AgentInstance[] {
  const rank = (driver: AgentDriverKind) => {
    const found = DRIVER_ORDER.indexOf(driver);
    return found === -1 ? DRIVER_ORDER.length : found;
  };
  return [...instances].sort(
    (left, right) =>
      rank(left.driver) - rank(right.driver) ||
      left.createdAt - right.createdAt ||
      left.instanceId.localeCompare(right.instanceId),
  );
}
