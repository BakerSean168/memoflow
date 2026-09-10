/**
 * Path resolver types for the multi-account desktop architecture.
 *
 * SharedPathResolver — device-level shared state paths
 * ProfilePathResolver — per-account profile paths
 */

export interface SharedPathResolver {
  readonly rootDir: string;
  readonly sharedDir: string;
  readonly authDir: string;
  readonly configDir: string;
  readonly uiDir: string;
  readonly profilesRegistryDir: string;
  readonly deviceIdPath: string;
  readonly runtimeConfigPath: string;
  readonly profileAccessWindowStatePath: string;
  readonly registryPath: string;
  readonly cacheDir: string;
  readonly snapshotStagingDir: string;
  readonly downloadsDir: string;
  readonly tempDir: string;
  readonly logsDir: string;
  readonly userFilesRootDir: string;
  readonly userFilesExportsDir: string;
  readonly userFilesDownloadsDir: string;
  readonly userFilesAttachmentsDir: string;
}

export interface ProfilePathResolver {
  readonly profileId: string;
  readonly profileDir: string;
  readonly authDir: string;
  readonly tokensPath: string;
  readonly dbDir: string;
  readonly dbPath: string;
  readonly snapshotMetaPath: string;
  readonly storageDir: string;
  readonly repositoryStorageDir: string;
  readonly knowledgeNotesDir: string;
  readonly attachmentsDir: string;
  readonly localVaultBindingPath: string;
  readonly localVaultWriteLedgerPath: string;
  readonly knowledgeRepositoryAutoSyncStatePath: string;
  readonly uiDir: string;
  readonly mainWindowStatePath: string;
  readonly desktopNotificationPreferencePath: string;
}
