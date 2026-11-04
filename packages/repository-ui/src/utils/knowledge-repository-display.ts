import type { KnowledgeRemoteBindingClientDTO } from '@memoflow/repository-contracts';

export type RepositoryProviderState = 'Ready' | 'Blocked' | 'Unchecked';

/** Repository full name with observation fallback to the binding snapshot. */
export function resolveRepositoryDisplayName(binding: KnowledgeRemoteBindingClientDTO): string {
  return binding.observation?.repositoryFullName ?? binding.repositoryFullNameSnapshot;
}

/** Observed default branch, then history fence, then the shared em dash. */
export function resolveDefaultBranch(binding: KnowledgeRemoteBindingClientDTO): string {
  return binding.observation?.defaultBranch ?? binding.historyFence?.defaultBranch ?? '—';
}

/** Provider eligibility state, treating a missing observation as Unchecked. */
export function resolveProviderState(
  binding: KnowledgeRemoteBindingClientDTO,
): RepositoryProviderState {
  return binding.observation?.eligibility.state ?? 'Unchecked';
}
