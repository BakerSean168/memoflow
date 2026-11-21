/** Local Vault IPC lifecycle. The host never manages Git synchronization. */
import { ipcMain } from 'electron';
import { RepositoryChannels, type IElectronModuleContext } from '@memoflow/desktop-contracts';
import { fail, ok, type Result } from '@memoflow/transport-contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { withAuthenticatedValue } from './authenticated-ipc';
import { LocalVaultRuntimeError, type LocalVaultElectronPort } from './local-vault-runtime';

export {
  createLocalVaultRuntime,
  createElectronLocalVaultPlatform,
  LocalVaultRuntime,
  LocalVaultRuntimeError,
  type LocalVaultElectronPort,
  type LocalVaultPlatform,
  type LocalVaultRuntimeOptions,
} from './local-vault-runtime';
// Residual 957: sole vault FS guards (isMissing + isTemporaryFile) for Local Vault + Desktop knowledge repo.
export { isMissing, isTemporaryFile } from './vault-fs-guards';

const logger = createLogger('RepositoryElectron');

const allChannels = Object.entries(RepositoryChannels)
  .filter(([name]) => name.startsWith('LOCAL_VAULT_'))
  .map(([, channel]) => channel);

export interface RepositoryElectronModuleDef {
  readonly name: string;
  register(context: IElectronModuleContext): Promise<void>;
  destroy?(): Promise<void>;
}

export interface RepositoryElectronModuleOptions {
  localVaultPort?: LocalVaultElectronPort;
}

type ModuleHandleState = 'created' | 'registered' | 'disposed' | 'failed';

async function invokeLocalVault<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await operation());
  } catch (error) {
    if (error instanceof LocalVaultRuntimeError) {
      return fail({ code: error.code, message: error.message });
    }
    // Pass the Error itself so Winston preserves name, message and stack.
    logger.error('Local Vault operation failed', error);
    return fail({ code: 'INTERNAL_ERROR', message: 'Local Vault operation failed' });
  }
}

export function createRepositoryElectronModule(
  options: RepositoryElectronModuleOptions = {},
): RepositoryElectronModuleDef {
  let state: ModuleHandleState = 'created';
  const searches = new Map<number, AbortController>();
  const cancelSearches = () => {
    for (const controller of searches.values()) controller.abort();
    searches.clear();
  };

  return {
    name: 'Repository',

    async register(ctx: IElectronModuleContext): Promise<void> {
      if (state !== 'created') {
        throw new Error(
          `RepositoryElectronModule.register() called while in '${state}' state; a handle may only register once from 'created'`,
        );
      }

      const installed: string[] = [];

      try {
        const localVault = options.localVaultPort;
        const withLocalVault = async <T>(
          operation: (port: LocalVaultElectronPort) => Promise<T>,
        ): Promise<Result<T>> => {
          if (!localVault || state === 'disposed' || state === 'failed') {
            return fail({
              code: 'SERVICE_UNAVAILABLE',
              message: 'Local Vault is only available in the Desktop runtime',
            });
          }
          return invokeLocalVault(() => operation(localVault));
        };

        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_GET, (_) =>
          withAuthenticatedValue(ctx, () => withLocalVault((port) => port.getBinding())),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_GET);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_SELECT, (_, request) =>
          withAuthenticatedValue(ctx, async () => {
            const result = await withLocalVault((port) => port.selectVault(request));
            return result;
          }),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_SELECT);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_DETACH, (_) =>
          withAuthenticatedValue(ctx, async () => {
            const result = await withLocalVault((port) => port.detachVault());
            return result;
          }),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_DETACH);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_WRITES, (_) =>
          withAuthenticatedValue(ctx, () => withLocalVault((port) => port.listRecentWrites())),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_WRITES);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_SCAN, (_) =>
          withAuthenticatedValue(ctx, () => withLocalVault((port) => port.scanVault())),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_SCAN);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_NOTE_READ, (_, request) =>
          withAuthenticatedValue(ctx, () => withLocalVault((port) => port.readNote(request))),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_NOTE_READ);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_SEARCH, (event, request) =>
          withAuthenticatedValue(ctx, async () => {
            const sender = event.sender;
            searches.get(sender.id)?.abort();
            const controller = new AbortController();
            searches.set(sender.id, controller);
            const cancel = () => controller.abort();
            sender.once('destroyed', cancel);
            try {
              return await withLocalVault((port) =>
                port.searchVault(request, { signal: controller.signal }),
              );
            } finally {
              sender.removeListener('destroyed', cancel);
              if (searches.get(sender.id) === controller) searches.delete(sender.id);
            }
          }),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_SEARCH);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_OPEN_OBSIDIAN, (_, request) =>
          withAuthenticatedValue(ctx, () => withLocalVault((port) => port.openInObsidian(request))),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_OPEN_OBSIDIAN);
        ipcMain.handle(RepositoryChannels.LOCAL_VAULT_NOTE_WRITE_CONFIRMED, (_, request) =>
          withAuthenticatedValue(ctx, () =>
            withLocalVault((port) => port.writeConfirmedNote(request)),
          ),
        );
        installed.push(RepositoryChannels.LOCAL_VAULT_NOTE_WRITE_CONFIRMED);

        state = 'registered';
        logger.info('Repository module registered');
      } catch (error) {
        state = 'failed';
        cancelSearches();
        for (let i = installed.length - 1; i >= 0; i--) {
          ipcMain.removeHandler(installed[i]);
        }
        await options.localVaultPort?.dispose().catch((disposeError) => {
          logger.warn('Failed to dispose Local Vault', { error: disposeError });
        });
        throw error;
      }
    },

    async destroy(): Promise<void> {
      if (state === 'disposed' || state === 'failed') {
        return;
      }
      state = 'disposed';
      cancelSearches();

      for (const ch of allChannels) {
        ipcMain.removeHandler(ch);
      }
      await options.localVaultPort?.dispose();
      logger.info('Repository module destroyed');
    },
  };
}
