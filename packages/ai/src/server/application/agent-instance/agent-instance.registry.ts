import {
  AgentRegistryCommandSchema,
  LOCAL_AGENT_DEFAULT_EXECUTABLES,
  AgentInstanceSchema,
  AgentRegistrySnapshotSchema,
  type AgentConversationSelection,
  type AgentDriverKind,
  type AgentInstance,
  type AgentRegistryCommand,
  type AgentRegistrySnapshot,
} from '@memoflow/contracts/ai';
import { AgentRegistryError, type IAgentInstanceRepository } from './agent-instance.repository';

const names = {
  mastra: 'Mastra',
  codex: 'Codex',
  claude: 'Claude Code',
  pi: 'Pi',
  dsh: 'DSH',
  antigravity: 'Antigravity (AGY)',
};
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
/** Host-owned native runtime hook. The Registry persists identity; the runtime owns live turns. */
export interface AgentInstanceNativeLifecycle {
  /** Stop work that still holds the pre-change connection revision. */
  cancelConnection(owner: string, connectionId: string): void;
}
/** Identity/configuration authority only. Runtime sessions remain owned by their existing drivers. */
export class AgentInstanceRegistry {
  constructor(
    private readonly repository: IAgentInstanceRepository,
    private readonly host: 'web' | 'desktop',
    private readonly verifyBindingModel?: (
      owner: string,
      providerId: string,
      modelId: string,
    ) => Promise<number>,
    private readonly nativeLifecycle?: AgentInstanceNativeLifecycle,
  ) {}
  async list(owner: string): Promise<AgentRegistrySnapshot> {
    const snapshot = AgentRegistrySnapshotSchema.parse(await this.repository.list(owner));
    const drivers: AgentDriverKind[] =
      this.host === 'web' ? ['mastra'] : ['mastra', 'codex', 'claude', 'pi', 'dsh', 'antigravity'];
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
    const nativeConnectionId =
      current.driver === 'mastra' ? undefined : current.legacyConnectionId;
    if (input.action === 'reset') {
      if (current.instanceId !== current.driver) throw new AgentRegistryError('VALIDATION_ERROR');
      const defaults = defaultAgentInstance(current.driver);
      // A reset changes executable/home and invalidates the live turn before the
      // new revision becomes readable by the native tool bridge.
      if (nativeConnectionId)
        this.nativeLifecycle?.cancelConnection(owner, nativeConnectionId);
      return this.repository.replace(
        owner,
        AgentInstanceSchema.parse({
          ...current,
          name: defaults.name,
          accentColor: defaults.accentColor,
          enabled: defaults.enabled,
          ...(current.driver !== 'mastra'
            ? {
                nativeConfig: {
                  executablePath: LOCAL_AGENT_DEFAULT_EXECUTABLES[current.driver],
                  writeScopes: [],
                },
              }
            : {}),
          revision: current.revision + 1,
          createdAt: current.createdAt || Date.now(),
          updatedAt: Date.now(),
        }),
        input.expectedRevision,
      );
    }
    if (input.action === 'remove') {
      if (
        current.instanceId === current.driver ||
        !current.revision ||
        (await this.repository.hasConversationBindings(owner, current.instanceId))
      )
        throw new AgentRegistryError('CONFLICT');
      if (nativeConnectionId)
        this.nativeLifecycle?.cancelConnection(owner, nativeConnectionId);
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
    if (input.action === 'update') {
      // Disable/config changes must stop the old revision before it can accept
      // another native tool call with stale scopes.
      if (nativeConnectionId)
        this.nativeLifecycle?.cancelConnection(owner, nativeConnectionId);
      return this.repository.replace(owner, next, input.expectedRevision);
    }
    if (current.driver !== 'mastra') throw new AgentRegistryError('VALIDATION_ERROR');
    const binding = {
      instanceId: current.instanceId,
      connectionId: input.connectionId,
      modelId: input.action === 'bind' ? input.modelId : '',
    };
    const verifiedVersion =
      input.action === 'bind' && this.verifyBindingModel
        ? await this.verifyBindingModel(owner, input.connectionId, input.modelId)
        : undefined;
    return this.repository.bind(
      owner,
      next,
      input.expectedRevision,
      binding,
      input.action === 'unbind',
      verifiedVersion,
    );
  }
  /**
   * Executable selections must point to an enabled Mastra instance and an
   * bound model-service connection. binding.modelId is a saved default, not a
   * per-model permission list: live catalogue membership and model capabilities
   * remain exclusively enforced by ModelResolver before inference.
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
        (binding) => binding.instanceId === instanceId && binding.connectionId === providerId,
      )
    )
      throw new AgentRegistryError('AI_CONFIGURATION_REQUIRED');
  }

  /**
   * Claim on first explicitly bound turn. Missing binding rows designate legacy
   * conversations and retain their existing providerId/modelId semantics.
   * Later turns can select another validated Mastra instance. Omitting the instance is never a fallback.
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
