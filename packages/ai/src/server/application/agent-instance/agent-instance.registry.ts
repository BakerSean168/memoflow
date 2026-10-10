import {
  AgentRegistryCommandSchema,
  AgentInstanceSchema,
  AgentRegistrySnapshotSchema,
  type AgentConversationSelection,
  type AgentDriverKind,
  type AgentInstance,
  type AgentRegistryCommand,
  type AgentRegistrySnapshot,
} from '@memoflow/contracts/ai';
import { AgentRegistryError, type IAgentInstanceRepository } from './agent-instance.repository';

const names = { mastra: 'Mastra', codex: 'Codex', claude: 'Claude Code', pi: 'Pi', dsh: 'DSH' };
export function defaultAgentInstance(driver: AgentDriverKind): AgentInstance {
  return {
    instanceId: driver,
    driver,
    name: names[driver],
    accentColor: '#6469da',
    enabled: true,
    revision: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}
/** Identity/configuration authority only. Runtime sessions remain owned by their existing drivers. */
export class AgentInstanceRegistry {
  constructor(
    private readonly repository: IAgentInstanceRepository,
    private readonly host: 'web' | 'desktop',
  ) {}
  async list(owner: string): Promise<AgentRegistrySnapshot> {
    const snapshot = AgentRegistrySnapshotSchema.parse(await this.repository.list(owner));
    const drivers: AgentDriverKind[] =
      this.host === 'web' ? ['mastra'] : ['mastra', 'codex', 'claude', 'pi', 'dsh'];
    // A named instance never suppresses a driver's implicit default.
    for (const driver of drivers) {
      if (!snapshot.instances.some((instance) => instance.instanceId === driver))
        snapshot.instances.push(defaultAgentInstance(driver));
    }
    if (this.host === 'web' && snapshot.instances.some((instance) => instance.driver !== 'mastra'))
      throw new AgentRegistryError('FORBIDDEN');
    return snapshot;
  }
  async execute(
    owner: string,
    command: AgentRegistryCommand,
  ): Promise<AgentRegistrySnapshot | AgentInstance | AgentConversationSelection | null> {
    const input = AgentRegistryCommandSchema.parse(command);
    if (input.action === 'list') return this.list(owner);
    if (input.action === 'conversation_selection')
      return this.repository.getConversationSelection(owner, input.conversationId);
    if (input.action === 'create') {
      this.assertDriver(input.instance.driver);
      if (
        Object.keys(names).includes(input.instance.instanceId) &&
        input.instance.instanceId !== input.instance.driver
      )
        throw new AgentRegistryError('VALIDATION_ERROR');
      const now = Date.now();
      return this.repository.create(
        owner,
        AgentInstanceSchema.parse({
          ...input.instance,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    const current = (await this.list(owner)).instances.find(
      (instance) => instance.instanceId === input.instanceId,
    );
    if (!current) throw new AgentRegistryError('NOT_FOUND');
    this.assertDriver(current.driver);
    if (current.revision !== input.expectedRevision) throw new AgentRegistryError('CONFLICT');
    if (input.action === 'remove') {
      if (
        !current.revision ||
        (await this.repository.hasConversationBindings(owner, current.instanceId))
      )
        throw new AgentRegistryError('CONFLICT');
      await this.repository.remove(owner, current.instanceId, input.expectedRevision);
      return null;
    }
    const next = AgentInstanceSchema.parse({
      ...current,
      ...(input.action === 'update' ? input.patch : {}),
      revision: current.revision + 1,
      createdAt: current.createdAt || Date.now(),
      updatedAt: Date.now(),
    });
    if (next.driver === 'mastra' && next.nativeConfig !== undefined)
      throw new AgentRegistryError('VALIDATION_ERROR');
    if (input.action === 'update')
      return this.repository.replace(owner, next, input.expectedRevision);
    if (current.driver !== 'mastra') throw new AgentRegistryError('VALIDATION_ERROR');
    const binding = {
      instanceId: current.instanceId,
      connectionId: input.connectionId,
      modelId: input.action === 'bind' ? input.modelId : '',
    };
    return this.repository.bind(
      owner,
      next,
      input.expectedRevision,
      binding,
      input.action === 'unbind',
    );
  }
  /**
   * Executable selections must point to an enabled Mastra instance and an
   * exact, previously verified model-service binding. No global provider fallback.
   */
  async assertModelBinding(
    owner: string,
    instanceId: string,
    providerId?: string | null,
    modelId?: string | null,
  ): Promise<void> {
    if (!providerId || !modelId) throw new AgentRegistryError('AI_CONFIGURATION_REQUIRED');
    const { instances, bindings } = await this.list(owner);
    const instance = instances.find((candidate) => candidate.instanceId === instanceId);
    if (!instance || instance.driver !== 'mastra' || !instance.enabled)
      throw new AgentRegistryError('AI_CONFIGURATION_REQUIRED');
    if (
      !bindings.some(
        (binding) =>
          binding.instanceId === instanceId &&
          binding.connectionId === providerId &&
          binding.modelId === modelId,
      )
    )
      throw new AgentRegistryError('AI_CONFIGURATION_REQUIRED');
  }

  /**
   * Claim on first explicitly bound turn. Missing binding rows designate legacy
   * conversations and retain their existing providerId/modelId semantics.
   * Once claimed, omitting/changing the instance is an error, not a fallback.
   */
  async assertTurnSelection(input: {
    owner: string;
    conversationId: string;
    agentInstanceId?: string;
    providerId?: string | null;
    modelId?: string | null;
  }): Promise<void> {
    const { owner, conversationId, agentInstanceId, providerId, modelId } = input;
    if (!agentInstanceId) {
      if (await this.repository.getConversationInstance(owner, conversationId))
        throw new AgentRegistryError('AI_CONFIGURATION_REQUIRED');
      return;
    }
    await this.assertModelBinding(owner, agentInstanceId, providerId, modelId);
    await this.repository.claimConversationInstance(
      owner,
      conversationId,
      agentInstanceId,
      providerId ?? undefined,
      modelId ?? undefined,
    );
  }

  private assertDriver(driver: AgentDriverKind) {
    if (this.host === 'web' && driver !== 'mastra') throw new AgentRegistryError('FORBIDDEN');
  }
}
