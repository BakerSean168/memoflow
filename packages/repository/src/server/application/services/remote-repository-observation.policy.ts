import type {
  GitHubInstallationRepositoryDTO,
  KnowledgeRemoteBindingServerDTO,
  RemoteHistoryFence,
  RemoteRepositoryBlockReason,
  RemoteRepositoryEligibility,
  RemoteRepositoryObservation,
} from '@memoflow/repository-contracts';
import type { GitHubAppInstallationInventory } from '../ports/github-app-client.port';

export function classifyRemoteRepositoryEligibility(
  inventory: GitHubAppInstallationInventory,
  repository: GitHubInstallationRepositoryDTO,
  _historyFence: RemoteHistoryFence | null,
): RemoteRepositoryEligibility {
  let reason: RemoteRepositoryBlockReason | null = null;
  if (inventory.suspended) reason = 'InstallationSuspended';
  else if (inventory.contentsPermission === 'none' || !repository.permissions.pull) {
    reason = 'ContentsPermissionRequired';
  } else if (!repository.private) reason = 'RepositoryPublic';
  else if (repository.archived) reason = 'RepositoryArchived';
  else if (repository.disabled) reason = 'RepositoryDisabled';
  return reason ? { state: 'Blocked', reason } : { state: 'Ready' };
}

export function buildRemoteRepositoryObservation(input: {
  binding: KnowledgeRemoteBindingServerDTO;
  inventory: GitHubAppInstallationInventory;
  repository: GitHubInstallationRepositoryDTO;
  historyFence: RemoteHistoryFence | null;
  observedAt: number;
}): RemoteRepositoryObservation {
  return {
    bindingId: input.binding.id,
    observedAt: input.observedAt,
    accountId: input.inventory.accountId,
    repositoryFullName: input.repository.fullName,
    defaultBranch: input.repository.defaultBranch,
    private: input.repository.private,
    archived: input.repository.archived,
    disabled: input.repository.disabled,
    contentsPermission: input.inventory.contentsPermission,
    installationSuspended: input.inventory.suspended,
    eligibility: classifyRemoteRepositoryEligibility(
      input.inventory,
      input.repository,
      input.historyFence,
    ),
  };
}
