/** Desktop knowledge uses the selected local Vault. File synchronization is external. */
import {
  createRepositoryElectronModule,
  type LocalVaultElectronPort,
  type RepositoryElectronModuleDef,
} from '@memoflow/repository/electron';

export interface ComposeRepositoryDesktopDependencies {
  readonly localVaultPort: LocalVaultElectronPort;
}

export function composeRepository(
  dependencies: ComposeRepositoryDesktopDependencies,
): RepositoryElectronModuleDef {
  return createRepositoryElectronModule(dependencies);
}
