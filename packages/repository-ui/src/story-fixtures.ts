import type {
  KnowledgeRemoteBindingClientDTO,
  LocalVaultBindingSnapshotDTO,
  LocalVaultHealthState,
  LocalVaultWriteReceipt,
} from '@memoflow/repository-contracts';

/**
 * Deterministic Repository read models for P1-B catalog stories. The shapes are
 * the production contract DTOs; nothing here talks to a Vault, GitHub or the
 * cloud, and no write path is exercised by a story render.
 */
const boundAt = Date.UTC(2026, 9, 2, 9, 0);
const observedAt = Date.UTC(2026, 10, 24, 8, 30);

export function createStoryVaultSnapshot(
  state: LocalVaultHealthState = 'Available',
): LocalVaultBindingSnapshotDTO {
  return {
    binding: {
      id: 'ILocalVaultBindingId_story_vault' as LocalVaultBindingSnapshotDTO['binding']['id'],
      knowledgeSpaceId:
        'IKnowledgeSpaceId_story_space' as LocalVaultBindingSnapshotDTO['binding']['knowledgeSpaceId'],
      localProfileId: 'desktop-profile-story',
      rootPath: '/Users/story/ResearchVault',
      displayName: 'Research vault',
      boundAt,
      detachedAt: null,
    },
    health: {
      bindingId:
        'ILocalVaultBindingId_story_vault' as LocalVaultBindingSnapshotDTO['health']['bindingId'],
      state,
      observedAt,
      detail: state === 'Available' ? null : 'The vault folder was moved or is not readable.',
    },
  };
}

export const storyVaultWrites: LocalVaultWriteReceipt[] = [
  {
    documentId: 'IKnowledgeDocumentId_story_doc_1' as never,
    title: 'Guard rails for deep-work blocks',
    relativePath: 'notes/guard-rails-for-deep-work.md',
    createdAt: Date.UTC(2026, 10, 24, 8, 12),
  },
  {
    documentId: 'IKnowledgeDocumentId_story_doc_2' as never,
    title: 'Quarterly architecture review notes',
    relativePath: 'reviews/2026-q4-architecture.md',
    createdAt: Date.UTC(2026, 10, 23, 17, 45),
  },
];

export function createStoryRemoteConnection(
  overrides: {
    id?: string;
    name?: string;
    eligibility?: 'Ready' | 'Blocked';
    state?: 'Ready' | 'Lagging' | 'Rebuilding' | 'Failed';
  } = {},
): KnowledgeRemoteBindingClientDTO {
  const id = overrides.id ?? 'story-connection-1';
  const name = overrides.name ?? 'memoflow/architecture-notes';
  return {
    id: id as KnowledgeRemoteBindingClientDTO['id'],
    knowledgeSpaceId: 'IKnowledgeSpaceId_story_space' as never,
    identityId: 'IdentityId_story' as never,
    provider: 'GitHub',
    installationId: 'installation-story',
    repositoryId: `repository-${id}`,
    repositoryFullNameSnapshot: name,
    connectedAt: boundAt,
    disconnectedAt: null,
    observation: {
      bindingId: id as never,
      observedAt,
      accountId: 'github-account-story',
      repositoryFullName: name,
      defaultBranch: 'main',
      private: true,
      archived: false,
      disabled: false,
      contentsPermission: 'read',
      installationSuspended: false,
      eligibility:
        overrides.eligibility === 'Blocked'
          ? { state: 'Blocked', reason: 'ContentsPermissionRequired' }
          : { state: 'Ready' },
    },
    historyFence: {
      bindingId: id as never,
      defaultBranch: 'main',
      lastConfirmedRemoteHeadSha: '4f1d2c3b5a6978877665544332211a0b9c8d7e6f',
      confirmedAt: observedAt,
    },
    projectionCheckpoint: {
      bindingId: id as never,
      branch: 'main',
      projectedCommitSha: '4f1d2c3b5a6978877665544332211a0b9c8d7e6f',
      state: overrides.state ?? 'Ready',
      failure: null,
      lastAttemptAt: observedAt,
      projectedAt: observedAt,
    },
  } as KnowledgeRemoteBindingClientDTO;
}
