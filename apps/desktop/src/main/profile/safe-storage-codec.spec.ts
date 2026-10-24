import { safeStorage } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { windowsUserDpapiProvider } from './wsl-dpapi';
import { decryptSafeStorageString, encryptSafeStorageString } from './safe-storage-codec';

const isEncryptionAvailable = vi.mocked(safeStorage.isEncryptionAvailable);
const isAsyncEncryptionAvailable = vi.mocked(safeStorage.isAsyncEncryptionAvailable);
const getSelectedStorageBackend = vi.mocked(safeStorage.getSelectedStorageBackend);
const encryptString = vi.mocked(safeStorage.encryptString);
const encryptStringAsync = vi.mocked(safeStorage.encryptStringAsync);
const decryptString = vi.mocked(safeStorage.decryptString);
const decryptStringAsync = vi.mocked(safeStorage.decryptStringAsync);

describe('safe-storage-codec', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    isEncryptionAvailable.mockReturnValue(true);
    isAsyncEncryptionAvailable.mockResolvedValue(true);
    getSelectedStorageBackend.mockReturnValue('gnome_libsecret');
    encryptString.mockImplementation((value) => Buffer.from(`sync:${value}`, 'utf8'));
    encryptStringAsync.mockImplementation(async (value) =>
      Buffer.from(`v11async:${value}`, 'utf8'),
    );
    decryptString.mockImplementation((value) => value.toString('utf8').replace(/^sync:/u, ''));
    decryptStringAsync.mockImplementation(async (value) => ({
      result: value.toString('utf8').replace(/^v11async:/u, ''),
      shouldReEncrypt: false,
    }));
    vi.spyOn(windowsUserDpapiProvider, 'isAvailable').mockReturnValue(false);
  });

  it('preserves the synchronous provider and legacy envelope when it is securely available', async () => {
    await expect(encryptSafeStorageString('secret')).resolves.toEqual(
      Buffer.from('sync:secret', 'utf8'),
    );
    expect(encryptStringAsync).not.toHaveBeenCalled();
  });

  it('uses the WSL Windows DPAPI envelope before Linux async fallback', async () => {
    isEncryptionAvailable.mockReturnValue(false);
    vi.spyOn(windowsUserDpapiProvider, 'isAvailable').mockReturnValue(true);
    vi.spyOn(windowsUserDpapiProvider, 'protect').mockResolvedValue(Buffer.from('dpapi-cipher'));
    vi.spyOn(windowsUserDpapiProvider, 'unprotect').mockResolvedValue(Buffer.from('secret'));

    const encrypted = await encryptSafeStorageString('secret');
    expect(encrypted.toString('utf8')).toBe('MFSS-WIN-DPAPI-V1\0dpapi-cipher');
    await expect(decryptSafeStorageString(encrypted)).resolves.toEqual({
      value: 'secret',
      shouldReEncrypt: false,
    });
    expect(encryptStringAsync).not.toHaveBeenCalled();
  });

  it('tags asynchronous OS-backed envelopes when sync and WSL DPAPI are unavailable', async () => {
    isEncryptionAvailable.mockReturnValue(false);
    const encrypted = await encryptSafeStorageString('secret');
    expect(encrypted.toString('utf8')).toBe('MFSS-ASYNC-V1\0v11async:secret');
    await expect(decryptSafeStorageString(encrypted)).resolves.toEqual({
      value: 'secret',
      shouldReEncrypt: false,
    });
  });

  it('keeps tagged async envelopes on the async decoder even if sync later becomes available', async () => {
    const encrypted = Buffer.from('MFSS-ASYNC-V1\0v11async:secret', 'utf8');
    await expect(decryptSafeStorageString(encrypted)).resolves.toEqual({
      value: 'secret',
      shouldReEncrypt: false,
    });
    expect(decryptString).not.toHaveBeenCalled();
  });

  it('rejects Linux basic_text instead of silently weakening Profile security', async () => {
    isEncryptionAvailable.mockReturnValue(false);
    getSelectedStorageBackend.mockReturnValue('basic_text');
    await expect(encryptSafeStorageString('secret')).rejects.toThrow(
      'Electron safeStorage encryption is unavailable',
    );
  });

  it('rejects v10 ciphertext even if a Linux provider reports itself as usable', async () => {
    isEncryptionAvailable.mockReturnValue(false);
    encryptStringAsync.mockResolvedValue(Buffer.from('v10insecure'));
    await expect(encryptSafeStorageString('secret')).rejects.toThrow('basic_text');
  });
});
