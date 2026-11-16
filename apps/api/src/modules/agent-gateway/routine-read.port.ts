import type { RoutineConfigurationQueryPort } from '@memoflow/routine';
import type { RoutineReadPort } from '@memoflow/agent-gateway';

/**
 * Adapts the already assembled Routine configuration query application; the
 * Gateway never sees Routine persistence.
 * @param port - Routine's read-only configuration projection.
 * @returns The concrete Routine read seam consumed by the Gateway.
 */
export function bindRoutineReadPort(port: RoutineConfigurationQueryPort): RoutineReadPort {
  return {
    getConfigurationSnapshot: (identityId) => port.getConfigurationSnapshot(identityId),
    getUpcomingOccurrences: (identityId, query) => port.getUpcomingOccurrences(identityId, query),
  };
}
