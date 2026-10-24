import { describe, expect, it } from 'vitest';
import { findWindowsPowerShellPath, isWslRuntime, WindowsUserDpapiProvider } from './wsl-dpapi';

describe('WSL Windows DPAPI bridge', () => {
  it('detects Microsoft WSL kernels without relying on PATH', () => {
    expect(
      isWslRuntime({
        platform: 'linux',
        osRelease: '6.6.87.2-microsoft-standard-WSL2',
        wslInterop: '',
      }),
    ).toBe(true);
    expect(isWslRuntime({ platform: 'linux', osRelease: '6.8.0-generic', wslInterop: '' })).toBe(
      false,
    );
  });

  it('prefers the canonical Windows PowerShell path exposed through /mnt/c', () => {
    const found = findWindowsPowerShellPath((candidate) => candidate.includes('/System32/'));
    expect(found).toBe('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe');
  });

  it('does not advertise DPAPI outside WSL', () => {
    const provider = new WindowsUserDpapiProvider({
      isWsl: false,
      powershellPath: '/powershell.exe',
    });
    expect(provider.isAvailable()).toBe(false);
  });

  it('does not advertise DPAPI when Windows PowerShell is unavailable', () => {
    const provider = new WindowsUserDpapiProvider({ isWsl: true, powershellPath: null });
    expect(provider.isAvailable()).toBe(false);
  });
});
