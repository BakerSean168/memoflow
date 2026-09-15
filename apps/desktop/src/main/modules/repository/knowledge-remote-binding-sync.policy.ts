import type { KnowledgeRemoteBindingClientDTO } from '@memoflow/contracts/repository';

export interface ReadyKnowledgeRemoteSyncState {
  readonly repositoryId: string;
  readonly repositoryFullName: string;
  readonly defaultBranch: string;
  readonly lastConfirmedRemoteHeadSha: string;
}

/**
 * Continuous sync is legal only after first reconciliation established a
 * history fence, provider observation is Ready, and Local/Remote share the
 * exact same KnowledgeSpace identity.
 */
export function resolveReadyKnowledgeRemoteSyncState(
  binding: KnowledgeRemoteBindingClientDTO,
  localKnowledgeSpaceId: string,
): ReadyKnowledgeRemoteSyncState | null {
  if (binding.disconnectedAt !== null || binding.knowledgeSpaceId !== localKnowledgeSpaceId) {
    return null;
  }
  if (binding.observation?.eligibility.state !== 'Ready' || !binding.historyFence) return null;
  if (binding.observation.defaultBranch !== binding.historyFence.defaultBranch) return null;

  return {
    repositoryId: binding.repositoryId,
    repositoryFullName:
      binding.observation.repositoryFullName || binding.repositoryFullNameSnapshot,
    defaultBranch: binding.historyFence.defaultBranch,
    lastConfirmedRemoteHeadSha: binding.historyFence.lastConfirmedRemoteHeadSha,
  };
}

export function isActiveKnowledgeRemoteBinding(
  binding: KnowledgeRemoteBindingClientDTO,
  localKnowledgeSpaceId?: string,
): boolean {
  return (
    binding.disconnectedAt === null &&
    (localKnowledgeSpaceId === undefined || binding.knowledgeSpaceId === localKnowledgeSpaceId)
  );
}
