/**
 * Windows -> WSL Obsidian bridge for Vaults selected through WSL UNC paths.
 *
 * The Repository retains ownership of canonical note-path validation. This
 * Desktop capability only adapts the host path to its WSL equivalent.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface WslObsidianOpen {
  readonly distro: string;
  readonly uri: string;
}

/** Return a WSL launch plan only for Obsidian URIs pointing at a WSL UNC path. */
export function resolveWslObsidianOpen(
  uri: string,
  platform: NodeJS.Platform,
): WslObsidianOpen | null {
  if (platform !== 'win32') return null;

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'obsidian:' || parsed.hostname !== 'open') return null;
  if (parsed.searchParams.getAll('path').length !== 1) return null;

  const windowsPath = parsed.searchParams.get('path');
  if (!windowsPath) return null;

  // Node/Windows may resolve the same UNC path with an extended-length prefix.
  const normalized = windowsPath.replace(/^\\\\\?\\UNC\\/i, '\\\\');
  const matched = /^\\\\(?:wsl\.localhost|wsl\$)\\([^\\]+)\\(.+)$/i.exec(normalized);
  if (!matched) return null;

  const [, distro, relativeToDistro] = matched;
  if (!distro || !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(distro)) return null;

  const parts = relativeToDistro.split('\\');
  if (
    parts.some(
      (segment) => !segment || segment === '.' || segment === '..' || segment.includes('\0'),
    )
  ) {
    return null;
  }

  // Use the registered URI handler inside the distro so existing WSLg launch
  // scripts and already-running Obsidian instances keep working.
  return {
    distro,
    uri:
      'obsidian://open?' +
      new URLSearchParams({
        path: '/' + parts.join('/'),
      }).toString(),
  };
}

/** Pass arguments verbatim; no zsh, PowerShell or cmd shell expansion occurs. */
export async function launchWslObsidian(plan: WslObsidianOpen): Promise<void> {
  try {
    await execFileAsync(
      'wsl.exe',
      ['--distribution', plan.distro, '--exec', '/usr/bin/xdg-open', plan.uri],
      { windowsHide: true, timeout: 15_000 },
    );
  } catch {
    // Avoid leaking absolute Vault paths in Desktop's IPC error responses.
    throw new Error('Could not open Obsidian in WSL; check the distro and its obsidian:// handler');
  }
}

export function createExternalEditorOpener(options: {
  readonly platform: NodeJS.Platform;
  readonly openNative: (uri: string) => Promise<void>;
  readonly openWsl?: (plan: WslObsidianOpen) => Promise<void>;
}): (uri: string) => Promise<void> {
  return async (uri) => {
    const plan = resolveWslObsidianOpen(uri, options.platform);
    if (plan) {
      await (options.openWsl ?? launchWslObsidian)(plan);
    } else {
      await options.openNative(uri);
    }
  };
}
