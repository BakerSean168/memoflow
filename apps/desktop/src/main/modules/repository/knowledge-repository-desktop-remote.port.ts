import type {
  ConfirmKnowledgeRepositoryHeadReq,
  KnowledgeRemoteBindingClientDTO,
  KnowledgeRepositoryContentState,
  KnowledgeRepositoryInstallationTokenRes,
  KnowledgeRepositoryReconciliationPreview,
  ListKnowledgeRepositoryConnectionsRes,
} from '@memoflow/contracts/repository';
import type { Result } from '@memoflow/contracts/result';

/**
 * Online operations used by the Desktop-owned local Vault/Git runtime.
 * Browser clients never receive the installation token methods behind this port.
 */
export interface KnowledgeRepositoryDesktopRemotePort {
  listKnowledgeRepositoryConnections(): Promise<Result<ListKnowledgeRepositoryConnectionsRes>>;
  previewKnowledgeRepositoryReconciliation(
    connectionId: string,
    localState: KnowledgeRepositoryContentState,
  ): Promise<Result<KnowledgeRepositoryReconciliationPreview>>;
  issueDesktopKnowledgeRepositoryToken(
    connectionId: string,
  ): Promise<Result<KnowledgeRepositoryInstallationTokenRes>>;
  confirmKnowledgeRepositoryHead(
    connectionId: string,
    request: ConfirmKnowledgeRepositoryHeadReq,
  ): Promise<Result<KnowledgeRemoteBindingClientDTO>>;
}
