/**
 * Disposable Linux shell-test storage. Playwright selects basic_text, while
 * Profile bootstrap requires safeStorage before creating the first window.
 * Never load this fixture from a production entrypoint or a persistent profile.
 */
const path = require('node:path');
const os = require('node:os');
const { safeStorage } = require('electron');
const profilePath = process.env.MEMOFLOW_DESKTOP_USER_DATA_PATH;
if (
  process.platform === 'linux' &&
  process.env.MEMOFLOW_SHELL_EPHEMERAL_STORAGE === '1' &&
  profilePath &&
  path.resolve(profilePath).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)
) {
  const prefix = 'memoflow-shell-e2e:';
  safeStorage.isEncryptionAvailable = () => true;
  safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
  safeStorage.encryptString = (value) => Buffer.from(`${prefix}${value}`, 'utf8');
  safeStorage.decryptString = (value) => {
    const plaintext = value.toString('utf8');
    if (!plaintext.startsWith(prefix)) throw new Error('Unexpected shell E2E safe-storage payload');
    return plaintext.slice(prefix.length);
  };
}

require(path.resolve(__dirname, '../../../../desktop/dist-electron/main.cjs'));
