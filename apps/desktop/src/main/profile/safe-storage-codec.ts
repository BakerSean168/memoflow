import { safeStorage } from 'electron';
import { windowsUserDpapiProvider } from './wsl-dpapi';

const ASYNC_ENVELOPE_PREFIX = Buffer.from('MFSS-ASYNC-V1\0', 'utf8');
const WSL_DPAPI_ENVELOPE_PREFIX = Buffer.from('MFSS-WIN-DPAPI-V1\0', 'utf8');
const CHROMIUM_BASIC_TEXT_PREFIX = Buffer.from('v10', 'ascii');

export interface SafeStorageDecodedValue {
  value: string;
  shouldReEncrypt: boolean;
}

function hasPrefix(value: Buffer, prefix: Buffer): boolean {
  return value.length > prefix.length && value.subarray(0, prefix.length).equals(prefix);
}

function isSecureLinuxBackend(): boolean {
  if (process.platform !== 'linux') return true;
  const backend = safeStorage.getSelectedStorageBackend();
  return backend !== 'basic_text' && backend !== 'unknown';
}

function assertNotBasicTextCiphertext(encrypted: Buffer): void {
  if (process.platform === 'linux' && encrypted.subarray(0, 3).equals(CHROMIUM_BASIC_TEXT_PREFIX)) {
    throw new Error('Electron safeStorage refused the insecure Linux basic_text provider');
  }
}

async function canUseSecureAsyncSafeStorage(): Promise<boolean> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return false;
  return isSecureLinuxBackend();
}

async function decryptAsyncEnvelope(encrypted: Buffer): Promise<SafeStorageDecodedValue> {
  if (!(await canUseSecureAsyncSafeStorage())) {
    throw new Error('Electron async safeStorage has no secure OS-backed provider');
  }
  assertNotBasicTextCiphertext(encrypted);
  const decoded = await safeStorage.decryptStringAsync(encrypted);
  return { value: decoded.result, shouldReEncrypt: decoded.shouldReEncrypt };
}

function canUseSynchronousSafeStorage(): boolean {
  return safeStorage.isEncryptionAvailable() && isSecureLinuxBackend();
}

export async function encryptSafeStorageString(value: string): Promise<Buffer> {
  if (canUseSynchronousSafeStorage()) {
    const encrypted = safeStorage.encryptString(value);
    assertNotBasicTextCiphertext(encrypted);
    return encrypted;
  }

  if (windowsUserDpapiProvider.isAvailable()) {
    const encrypted = await windowsUserDpapiProvider.protect(Buffer.from(value, 'utf8'));
    return Buffer.concat([WSL_DPAPI_ENVELOPE_PREFIX, encrypted]);
  }

  if (await canUseSecureAsyncSafeStorage()) {
    const encrypted = await safeStorage.encryptStringAsync(value);
    assertNotBasicTextCiphertext(encrypted);
    return Buffer.concat([ASYNC_ENVELOPE_PREFIX, encrypted]);
  }

  throw new Error('Electron safeStorage encryption is unavailable');
}

export async function decryptSafeStorageString(
  encrypted: Buffer,
): Promise<SafeStorageDecodedValue> {
  if (hasPrefix(encrypted, WSL_DPAPI_ENVELOPE_PREFIX)) {
    if (!windowsUserDpapiProvider.isAvailable()) {
      throw new Error(
        'Windows DPAPI bridge is unavailable for this MemoFlow secure-storage envelope',
      );
    }
    const decoded = await windowsUserDpapiProvider.unprotect(
      encrypted.subarray(WSL_DPAPI_ENVELOPE_PREFIX.length),
    );
    return { value: decoded.toString('utf8'), shouldReEncrypt: false };
  }

  if (hasPrefix(encrypted, ASYNC_ENVELOPE_PREFIX)) {
    return decryptAsyncEnvelope(encrypted.subarray(ASYNC_ENVELOPE_PREFIX.length));
  }

  assertNotBasicTextCiphertext(encrypted);
  let syncError: unknown = null;
  if (canUseSynchronousSafeStorage()) {
    try {
      return { value: safeStorage.decryptString(encrypted), shouldReEncrypt: false };
    } catch (error) {
      syncError = error;
    }
  }

  try {
    return await decryptAsyncEnvelope(encrypted);
  } catch (asyncError) {
    if (syncError) {
      const syncMessage = syncError instanceof Error ? syncError.message : String(syncError);
      const asyncMessage = asyncError instanceof Error ? asyncError.message : String(asyncError);
      throw new Error(
        `Electron safeStorage decryption failed: sync=${syncMessage}; async=${asyncMessage}`,
      );
    }
    throw asyncError;
  }
}
