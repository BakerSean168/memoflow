import type {
  AgentConversationSelection,
  AgentInstance,
  AgentInstanceModelBinding,
  AgentRegistrySnapshot,
} from '@memoflow/contracts/ai';

/** Host persistence boundary. Every mutation is owner scoped and atomic, including native compatibility and model ownership checks. */
export interface IAgentInstanceRepository {
  list(owner: string): Promise<AgentRegistrySnapshot>;
  create(owner: string, instance: AgentInstance): Promise<AgentInstance>;
  replace(owner: string, instance: AgentInstance, expectedRevision: number): Promise<AgentInstance>;
  remove(owner: string, instanceId: string, expectedRevision: number): Promise<void>;
  bind(
    owner: string,
    instance: AgentInstance,
    expectedRevision: number,
    binding: AgentInstanceModelBinding,
    remove: boolean,
    /** Trusted host validation; fenced against provider revision before committing. */
    verifiedProviderVersion?: number,
  ): Promise<AgentInstance>;
  hasConnectionBindings(owner: string, connectionId: string): Promise<boolean>;
  hasConversationBindings(owner: string, instanceId: string): Promise<boolean>;
  /** Stable owner-scoped turn binding, null for historical/legacy conversations. */
  getConversationInstance(owner: string, conversationId: string): Promise<string | null>;
  getConversationSelection(
    owner: string,
    conversationId: string,
  ): Promise<AgentConversationSelection | null>;
  /** Idempotent for the same identity; conflicting instance IDs must fail closed. */
  claimConversationInstance(
    owner: string,
    conversationId: string,
    instanceId: string,
    providerId?: string,
    modelId?: string,
  ): Promise<void>;
}
export class AgentRegistryError extends Error {
  constructor(
    readonly code:
      'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR' | 'FORBIDDEN' | 'AI_CONFIGURATION_REQUIRED',
  ) {
    super(
      {
        NOT_FOUND: 'Agent instance or model service not found',
        CONFLICT: 'Agent registry changed; reload before saving',
        VALIDATION_ERROR: 'Invalid Agent configuration or model binding',
        FORBIDDEN: 'This host only supports Mastra',
        AI_CONFIGURATION_REQUIRED: 'The selected Agent needs configuration',
      }[code],
    );
  }
}
