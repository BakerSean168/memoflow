import { describe, expect, it, vi } from 'vitest';
import {
  createExternalEditorOpener,
  resolveWslObsidianOpen,
  type WslObsidianOpen,
} from './wsl-obsidian-bridge';

function openPath(path: string): string {
  return 'obsidian://open?' + new URLSearchParams({ path }).toString();
}

const vault = '\\\\wsl.localhost\\Ubuntu-24.04\\home\\baker\\projects\\thought-forest';
const note = vault + '\\Inbox\\训练 计划.md';

describe('WSL Obsidian URI routing', () => {
  it('routes a Windows WSL UNC Vault to the registered WSL editor', () => {
    expect(resolveWslObsidianOpen(openPath(vault), 'win32')).toEqual({
      distro: 'Ubuntu-24.04',
      uri: openPath('/home/baker/projects/thought-forest'),
    });
  });

  it('preserves subfolders, whitespace and Unicode in note paths', () => {
    expect(resolveWslObsidianOpen(openPath(note), 'win32')).toEqual({
      distro: 'Ubuntu-24.04',
      uri: openPath('/home/baker/projects/thought-forest/Inbox/训练 计划.md'),
    });
  });

  it('handles both legacy wsl$ and extended-length UNC addresses', () => {
    const legacy = '\\\\wsl$\\Ubuntu-24.04\\home\\baker\\projects\\thought-forest';
    const extended =
      '\\\\?\\UNC\\wsl.localhost\\Ubuntu-24.04\\home\\baker\\projects\\thought-forest';
    for (const value of [legacy, extended]) {
      expect(resolveWslObsidianOpen(openPath(value), 'win32')?.uri).toBe(
        openPath('/home/baker/projects/thought-forest'),
      );
    }
  });

  it('does not route Windows native paths, Linux hosts, or unrelated URIs', () => {
    const urls = [
      openPath('C:\\Users\\baker\\Notes\\Today.md'),
      'obsidian://open?vault=thought-forest',
      'https://example.com/path',
      'obsidian://search?path=' + encodeURIComponent(vault),
      'invalid URI',
    ];
    for (const value of urls) {
      expect(resolveWslObsidianOpen(value, 'win32')).toBeNull();
    }
    expect(resolveWslObsidianOpen(openPath(vault), 'linux')).toBeNull();
  });

  it('does not invoke WSL on malformed or ambiguous paths', () => {
    const invalid = [
      '\\\\wsl.localhost\\Ubuntu-24.04\\home\\..\\etc\\passwd',
      '\\\\wsl.localhost\\Ubuntu-24.04\\home\\.\\test',
      '\\\\wsl.localhost\\Ubuntu-24.04\\',
      '\\\\wsl.localhost\\-invalid\\home\\baker',
    ];
    for (const value of invalid) {
      expect(resolveWslObsidianOpen(openPath(value), 'win32')).toBeNull();
    }
    const duplicated = openPath(vault) + '&path=' + encodeURIComponent(vault);
    expect(resolveWslObsidianOpen(duplicated, 'win32')).toBeNull();
  });
});

describe('ExternalEditorPort dispatch', () => {
  it('passes only WSL UNC notes to the WSL launcher', async () => {
    const openNative = vi.fn(async (_uri: string) => undefined);
    const openWsl = vi.fn(async (_plan: WslObsidianOpen) => undefined);
    const openExternal = createExternalEditorOpener({
      platform: 'win32',
      openNative,
      openWsl,
    });

    await openExternal(openPath(note));

    expect(openWsl).toHaveBeenCalledExactlyOnceWith({
      distro: 'Ubuntu-24.04',
      uri: openPath('/home/baker/projects/thought-forest/Inbox/训练 计划.md'),
    });
    expect(openNative).not.toHaveBeenCalled();

    const nativeUri = openPath('C:\\Users\\baker\\Notes\\Today.md');
    await openExternal(nativeUri);
    expect(openNative).toHaveBeenCalledExactlyOnceWith(nativeUri);
    expect(openWsl).toHaveBeenCalledTimes(1);
  });

  it('reports a WSL launch failure without silently opening the Windows handler', async () => {
    const openNative = vi.fn(async (_uri: string) => undefined);
    const openWsl = vi.fn(async (_plan: WslObsidianOpen) => {
      throw new Error('missing distribution');
    });
    const openExternal = createExternalEditorOpener({
      platform: 'win32',
      openNative,
      openWsl,
    });

    await expect(openExternal(openPath(vault))).rejects.toThrow('missing distribution');
    expect(openNative).not.toHaveBeenCalled();
  });
});
