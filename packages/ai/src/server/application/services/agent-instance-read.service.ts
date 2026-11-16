import type { AgentInstance } from '@memoflow/ai-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import {
  AgentRegistryError,
  type IAgentInstanceRepository,
} from '../agent-instance/agent-instance.repository';
import type {
  AgentInstanceProjection,
  IAgentInstanceReadPort,
} from '../ports/agent-instance-read.port';

/**
 * Trims a persisted Agent instance to the external read projection.
 * `nativeConfig`, `legacyConnectionId` and revision counters stay host-local.
 */
export function projectAgentInstance(instance: AgentInstance): AgentInstanceProjection {
  return {
    instanceId: instance.instanceId,
    driver: instance.driver,
    name: instance.name,
    enabled: instance.enabled,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
  };
}

/**
 * Owner read service for the AI Agent archive.
 *
 * Wraps the owner-scoped repository list so callers never touch persistence
 * rows. Owner isolation is inherited from the repository query: every read is
 * scoped by `cx.identityId`, and another owner's instance is indistinguishable
 * from a missing one.
 */
export class AgentInstanceReadService implements IAgentInstanceReadPort {
  constructor(private readonly instances: Pick<IAgentInstanceRepository, 'list'>) {}

  async list(cx: ExecutionContext): Promise<readonly AgentInstanceProjection[]> {
    const snapshot = await this.instances.list(cx.identityId);
    return snapshot.instances.map(projectAgentInstance);
  }

  async get(instanceId: string, cx: ExecutionContext): Promise<AgentInstanceProjection> {
    const snapshot = await this.instances.list(cx.identityId);
    const instance = snapshot.instances.find((candidate) => candidate.instanceId === instanceId);
    if (!instance) throw new AgentRegistryError('NOT_FOUND');
    return projectAgentInstance(instance);
  }
}
