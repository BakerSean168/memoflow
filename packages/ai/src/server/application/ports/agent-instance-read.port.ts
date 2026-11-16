import type { AgentDriverKind } from '@memoflow/ai-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';

/**
 * Bounded owner projection of one persisted Agent instance.
 *
 * Only the fields an external caller needs to recognize an Agent archive entry
 * are projected: stable identity (`instanceId`), driver kind, display name,
 * enabled status and the creation/update timestamps. Host-local runtime
 * settings (`nativeConfig`: executable/home paths, write scopes, permission
 * mode), the internal `legacyConnectionId` pointer and model-service
 * `bindings` stay out of the projection — they are credential-adjacent or
 * host-topology state that no external Agent needs in order to identify an
 * instance.
 */
export interface AgentInstanceProjection {
  readonly instanceId: string;
  readonly driver: AgentDriverKind;
  readonly name: string;
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Owner-scoped read seam over the AI Agent archive.
 *
 * `ExecutionContext` carries the resolved owner (`identityId`) exactly as in
 * `AssistantConversationPort`; transports never pass an owner separately.
 * Agent instances that are only synthesized as host defaults are not part of
 * the owner archive and therefore never appear here.
 */
export interface IAgentInstanceReadPort {
  /** Archive entries owned by `cx.identityId`; empty when the owner has none. */
  list(cx: ExecutionContext): Promise<readonly AgentInstanceProjection[]>;
  /**
   * One archive entry. A missing id and an id owned by someone else both fail
   * with the same not-found outcome, so callers cannot probe existence.
   */
  get(instanceId: string, cx: ExecutionContext): Promise<AgentInstanceProjection>;
}
