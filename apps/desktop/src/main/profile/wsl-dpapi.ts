import { spawn } from 'node:child_process';
import fs from 'node:fs';

const WINDOWS_POWERSHELL_CANDIDATES = [
  '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
  '/mnt/c/Windows/Sysnative/WindowsPowerShell/v1.0/powershell.exe',
] as const;
const BRIDGE_TIMEOUT_MS = 10_000;
const MAX_BRIDGE_OUTPUT_BYTES = 1024 * 1024;

export interface WslDpapiRuntimeProbe {
  platform?: NodeJS.Platform;
  osRelease?: string;
  wslInterop?: string;
}

export function isWslRuntime({
  platform = process.platform,
  osRelease,
  wslInterop = process.env.WSL_INTEROP,
}: WslDpapiRuntimeProbe = {}): boolean {
  if (platform !== 'linux') return false;
  if (wslInterop) return true;
  const release = osRelease ?? readLinuxOsRelease();
  return /microsoft|wsl/iu.test(release);
}

function readLinuxOsRelease(): string {
  try {
    return fs.readFileSync('/proc/sys/kernel/osrelease', 'utf8');
  } catch {
    return '';
  }
}

export function findWindowsPowerShellPath(
  existsSync: (candidate: string) => boolean = fs.existsSync,
): string | null {
  return WINDOWS_POWERSHELL_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

function createPowerShellEncodedCommand(mode: 'encrypt' | 'decrypt'): string {
  const operation =
    mode === 'encrypt'
      ? '[System.Security.Cryptography.ProtectedData]::Protect($inputBytes, $null, $scope)'
      : '[System.Security.Cryptography.ProtectedData]::Unprotect($inputBytes, $null, $scope)';
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Security',
    '$inputB64 = [Console]::In.ReadToEnd().Trim()',
    '$inputBytes = [Convert]::FromBase64String($inputB64)',
    '$scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser',
    `$outputBytes = ${operation}`,
    '[Console]::Out.Write([Convert]::ToBase64String($outputBytes))',
  ].join('\n');
  return Buffer.from(script, 'utf16le').toString('base64');
}

export interface WindowsUserDpapiProviderOptions {
  isWsl?: boolean;
  powershellPath?: string | null;
}

export class WindowsUserDpapiProvider {
  private readonly wsl: boolean;
  private readonly powershellPath: string | null;

  constructor(options: WindowsUserDpapiProviderOptions = {}) {
    this.wsl = options.isWsl ?? isWslRuntime();
    this.powershellPath = options.powershellPath ?? findWindowsPowerShellPath();
  }

  isAvailable(): boolean {
    return this.wsl && Boolean(this.powershellPath);
  }

  protect(value: Buffer): Promise<Buffer> {
    return this.run('encrypt', value);
  }

  unprotect(value: Buffer): Promise<Buffer> {
    return this.run('decrypt', value);
  }

  private async run(mode: 'encrypt' | 'decrypt', value: Buffer): Promise<Buffer> {
    const powershellPath = this.powershellPath;
    if (!this.wsl || !powershellPath) {
      throw new Error('Windows DPAPI bridge is unavailable');
    }

    return new Promise<Buffer>((resolve, reject) => {
      const child = spawn(
        powershellPath,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          createPowerShellEncodedCommand(mode),
        ],
        { windowsHide: true },
      );
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let outputBytes = 0;
      let settled = false;

      const finish = (error?: Error, output?: Buffer) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else if (output) resolve(output);
        else reject(new Error('Windows DPAPI bridge returned no output'));
      };

      const timer = setTimeout(() => {
        child.kill();
        finish(new Error(`Windows DPAPI bridge timed out after ${BRIDGE_TIMEOUT_MS}ms`));
      }, BRIDGE_TIMEOUT_MS);

      child.stdout.on('data', (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_BRIDGE_OUTPUT_BYTES) {
          child.kill();
          finish(new Error('Windows DPAPI bridge output exceeded the safety limit'));
          return;
        }
        stdout.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.on('error', (error: Error) => finish(error));
      child.on('close', (code: number | null) => {
        if (settled) return;
        if (code !== 0) {
          const detail = Buffer.concat(stderr).toString('utf8').replace(/\r/gu, '').trim();
          finish(new Error(`Windows DPAPI bridge exited with code ${code}: ${detail}`));
          return;
        }
        const base64 = Buffer.concat(stdout).toString('utf8').replace(/\r/gu, '').trim();
        try {
          finish(undefined, Buffer.from(base64, 'base64'));
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });

      child.stdin.end(value.toString('base64'));
    });
  }
}

export const windowsUserDpapiProvider = new WindowsUserDpapiProvider();
