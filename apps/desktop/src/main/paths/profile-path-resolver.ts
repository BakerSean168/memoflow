import crypto from 'node:crypto';
import path from 'node:path';
import type { ProfilePathResolver } from './types';

/**
 * Compute a stable profileId from an identityId.
 * Deterministic: same identityId always produces the same profileId.
 * Does not expose the raw identityId in directory names.
 */
export function computeProfileId(identityId: string): string {
  const hash = crypto.createHash('sha256').update(identityId).digest('hex').slice(0, 24);
  return `p_${hash}`;
}

/**
 * Creates a ProfilePathResolver from the application root directory and profileId.
 * Pure computation — does not create directories on disk.
 */
export function createProfilePathResolver(rootDir: string, profileId: string): ProfilePathResolver {
  const profileDir = path.join(rootDir, 'profiles', profileId);
  const authDir = path.join(profileDir, 'auth');
  const dbDir = path.join(profileDir, 'db');
  const storageDir = path.join(profileDir, 'storage');
  const uiDir = path.join(profileDir, 'ui');

  return {
    profileId,
    profileDir,

    authDir,
    tokensPath: path.join(authDir, 'tokens.enc'),

    dbDir,
    dbPath: path.join(dbDir, 'powersync.sqlite'),
    snapshotMetaPath: path.join(dbDir, 'snapshot-meta.json'),

    storageDir,
    repositoryStorageDir: path.join(storageDir, 'repository-storage'),
    knowledgeNotesDir: path.join(storageDir, 'knowledge-notes'),
    attachmentsDir: path.join(storageDir, 'attachments'),
    localVaultBindingPath: path.join(storageDir, 'local-vault-binding.json'),
    localVaultWriteLedgerPath: path.join(storageDir, 'local-vault-write-ledger.json'),
    knowledgeRepositoryAutoSyncStatePath: path.join(
      storageDir,
      'knowledge-repository-auto-sync.json',
    ),

    uiDir,
    mainWindowStatePath: path.join(uiDir, 'main-window-state.json'),
    desktopNotificationPreferencePath: path.join(uiDir, 'notification-preference.json'),
  };
}
