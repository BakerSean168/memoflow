import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createElectronLocalVaultPlatform,
  LocalVaultRuntime,
  LocalVaultRuntimeError,
  type LocalVaultPlatform,
} from './local-vault-runtime';

/**
 * External Editor characterization tests.
 *
 * Locks the current "open in external editor (Obsidian)" capability —
 * `LocalVaultRuntime.openInObsidian` delegating to the `LocalVaultPlatform`
 * `openExternal` port (`ExternalEditorPort`) — so the capability ownership
 * migration cannot change it silently.
 */
describe('LocalVaultRuntime external editor (openInObsidian)', () => {
  let root: string;
  let vault: string;
  let platform: LocalVaultPlatform;
  let runtime: LocalVaultRuntime;

  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'memoflow-external-editor-'));
    vault = path.join(root, 'My Vault');
    await fs.promises.mkdir(vault, { recursive: true });
    platform = {
      selectDirectory: vi.fn(async () => vault),
      openExternal: vi.fn(async () => undefined),
    };
    runtime = new LocalVaultRuntime({
      bindingFilePath: path.join(root, 'profile', 'local-vault-binding.json'),
      writeLedgerFilePath: path.join(root, 'profile', 'local-vault-write-ledger.json'),
      localProfileId: 'p_external_editor',
      platform,
      now: () => 1_750_000_000_000,
    });
  });

  afterEach(async () => {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  async function selectVault(): Promise<void> {
    const snapshot = await runtime.selectVault();
    expect(snapshot?.health.state).toBe('Available');
  }

  function externalUri(): string {
    return vi.mocked(platform.openExternal).mock.calls[0]?.[0] ?? '';
  }

  it('opens the vault root when no note path is requested', async () => {
    await selectVault();
    await runtime.openInObsidian({});
    const uri = externalUri();
    expect(uri.startsWith('obsidian://open?path=')).toBe(true);
    expect(new URL(uri).searchParams.get('path')).toBe(await fs.promises.realpath(vault));
  });

  it('opens a note at its canonical path, percent-encoding the URI', async () => {
    await selectVault();
    await fs.promises.mkdir(path.join(vault, 'Agent'), { recursive: true });
    const notePath = path.join(vault, 'Agent', 'My note.md');
    await fs.promises.writeFile(notePath, '# My note');

    await runtime.openInObsidian({ relativePath: 'Agent/My note.md' });
    const uri = externalUri();
    expect(uri).toContain('obsidian://open?path=');
    expect(new URL(uri).searchParams.get('path')).toBe(await fs.promises.realpath(notePath));
  });

  it('throws NOT_FOUND when no vault is selected', async () => {
    await expect(runtime.openInObsidian({})).rejects.toMatchObject<Partial<LocalVaultRuntimeError>>(
      { code: 'NOT_FOUND' },
    );
    expect(platform.openExternal).not.toHaveBeenCalled();
  });

  it('rejects a non-Markdown note path before opening', async () => {
    await selectVault();
    await expect(runtime.openInObsidian({ relativePath: 'notes/todo.txt' })).rejects.toMatchObject<
      Partial<LocalVaultRuntimeError>
    >({ code: 'VALIDATION_ERROR' });
    expect(platform.openExternal).not.toHaveBeenCalled();
  });

  it('rejects an absolute note path before opening', async () => {
    await selectVault();
    await expect(runtime.openInObsidian({ relativePath: '/etc/passwd.md' })).rejects.toMatchObject<
      Partial<LocalVaultRuntimeError>
    >({ code: 'VALIDATION_ERROR' });
    expect(platform.openExternal).not.toHaveBeenCalled();
  });

  it('rejects a note path that escapes the vault', async () => {
    await selectVault();
    await expect(runtime.openInObsidian({ relativePath: '../escape.md' })).rejects.toMatchObject<
      Partial<LocalVaultRuntimeError>
    >({ code: 'VALIDATION_ERROR' });
    expect(platform.openExternal).not.toHaveBeenCalled();
  });

  it('rejects a symlink that escapes the vault', async () => {
    await selectVault();
    const outside = path.join(root, 'outside.md');
    await fs.promises.writeFile(outside, '# outside');
    await fs.promises.symlink(outside, path.join(vault, 'escape.md'));

    await expect(runtime.openInObsidian({ relativePath: 'escape.md' })).rejects.toMatchObject<
      Partial<LocalVaultRuntimeError>
    >({ code: 'FORBIDDEN' });
    expect(platform.openExternal).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the requested note does not exist', async () => {
    await selectVault();
    await expect(runtime.openInObsidian({ relativePath: 'missing.md' })).rejects.toMatchObject<
      Partial<LocalVaultRuntimeError>
    >({ code: 'NOT_FOUND' });
    expect(platform.openExternal).not.toHaveBeenCalled();
  });
});

describe('createElectronLocalVaultPlatform delegates to the injected external-editor port', () => {
  const NOW = 1750000000000;
  let root: string;
  let vault: string;
  let bindingFilePath: string;
  let opener: ReturnType<typeof vi.fn>;
  let platform: LocalVaultPlatform;
  let runtime: LocalVaultRuntime;

  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'memoflow-injected-editor-'));
    vault = path.join(root, 'Vault');
    await fs.promises.mkdir(vault, { recursive: true });
    const canonicalRoot = await fs.promises.realpath(vault);
    bindingFilePath = path.join(root, 'binding.json');
    await fs.promises.writeFile(
      bindingFilePath,
      JSON.stringify({
        schemaVersion: 2,
        binding: {
          id: 'LocalVaultBindingId_550e8400-e29b-41d4-a716-446655440000',
          knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440001',
          localProfileId: 'p_injected_editor',
          rootPath: canonicalRoot,
          displayName: path.basename(vault),
          boundAt: NOW,
          detachedAt: null,
        },
      }),
      'utf8',
    );
    opener = vi.fn(async () => undefined);
    platform = createElectronLocalVaultPlatform({ openExternal: opener });
    runtime = new LocalVaultRuntime({
      bindingFilePath,
      writeLedgerFilePath: path.join(root, 'ledger.json'),
      localProfileId: 'p_injected_editor',
      platform,
      now: () => NOW,
    });
  });

  afterEach(async () => {
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('forwards the exact obsidian URI to the injected registry-owned opener', async () => {
    await runtime.openInObsidian({});

    const uri = opener.mock.calls[0]?.[0] as string;
    expect(uri.startsWith('obsidian://open?path=')).toBe(true);
    expect(new URL(uri).searchParams.get('path')).toBe(await fs.promises.realpath(vault));
    expect(opener).toHaveBeenCalledTimes(1);
  });

  it('rejects (no success) when the injected opener fails', async () => {
    opener.mockRejectedValueOnce(
      new LocalVaultRuntimeError('INTERNAL_ERROR', 'External editor capability is unavailable'),
    );

    await expect(runtime.openInObsidian({})).rejects.toMatchObject<Partial<LocalVaultRuntimeError>>(
      { code: 'INTERNAL_ERROR' },
    );
    expect(opener).toHaveBeenCalledTimes(1);
  });
});
