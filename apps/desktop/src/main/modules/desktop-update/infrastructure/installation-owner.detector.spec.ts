import { describe, expect, it } from 'vitest';
import {
  type DesktopInstallationEvidence,
  detectDesktopInstallationOwner,
} from './installation-owner.detector';

describe('detectDesktopInstallationOwner', () => {
  const cases: Array<{
    name: string;
    evidence: DesktopInstallationEvidence;
    owner: ReturnType<typeof detectDesktopInstallationOwner>['owner'];
    canSelfInstall: boolean;
  }> = [
    {
      name: 'Windows packaged direct NSIS',
      evidence: { isPackaged: true, platform: 'win32' },
      owner: 'memoflow-direct',
      canSelfInstall: true,
    },
    {
      name: 'Windows Store',
      evidence: { isPackaged: true, platform: 'win32', isWindowsStore: true },
      owner: 'system-store',
      canSelfInstall: false,
    },
    {
      name: 'Windows portable',
      evidence: { isPackaged: true, platform: 'win32', portableExecutable: true },
      owner: 'portable',
      canSelfInstall: false,
    },
    {
      name: 'signed/notarized direct macOS',
      evidence: {
        isPackaged: true,
        platform: 'darwin',
        macosTrust: 'signed-notarized',
      },
      owner: 'memoflow-direct',
      canSelfInstall: true,
    },
    {
      name: 'unsigned macOS pilot',
      evidence: {
        isPackaged: true,
        platform: 'darwin',
        macosTrust: 'unsigned-pilot',
      },
      owner: 'unsupported',
      canSelfInstall: false,
    },
    {
      name: 'Mac App Store',
      evidence: {
        isPackaged: true,
        platform: 'darwin',
        isMacAppStore: true,
        macosTrust: 'signed-notarized',
      },
      owner: 'system-store',
      canSelfInstall: false,
    },
    {
      name: 'Linux AppImage',
      evidence: { isPackaged: true, platform: 'linux', appImage: true },
      owner: 'memoflow-direct',
      canSelfInstall: true,
    },
    {
      name: 'Linux deb',
      evidence: {
        isPackaged: true,
        platform: 'linux',
        linuxPackageManager: 'deb',
      },
      owner: 'package-manager',
      canSelfInstall: false,
    },
    {
      name: 'Linux rpm',
      evidence: {
        isPackaged: true,
        platform: 'linux',
        linuxPackageManager: 'rpm',
      },
      owner: 'package-manager',
      canSelfInstall: false,
    },
    {
      name: 'Linux snap',
      evidence: {
        isPackaged: true,
        platform: 'linux',
        linuxPackageManager: 'snap',
      },
      owner: 'package-manager',
      canSelfInstall: false,
    },
    {
      name: 'development build',
      evidence: { isPackaged: false, platform: 'linux', appImage: true },
      owner: 'unsupported',
      canSelfInstall: false,
    },
  ];

  for (const fixture of cases) {
    it(fixture.name, () => {
      const result = detectDesktopInstallationOwner(fixture.evidence);
      expect(result.owner).toBe(fixture.owner);
      expect(result.capabilities.canSelfInstall).toBe(fixture.canSelfInstall);
    });
  }

  it('lets enterprise policy override an otherwise self-managed installation', () => {
    const result = detectDesktopInstallationOwner({
      isPackaged: true,
      platform: 'win32',
      enterpriseManaged: true,
    });

    expect(result).toMatchObject({
      owner: 'enterprise-managed',
      reason: 'enterprise-managed',
      capabilities: {
        installAuthority: 'administrator',
        canSelfInstall: false,
      },
    });
  });

  it('fails closed for an unknown Linux installation shape', () => {
    expect(detectDesktopInstallationOwner({ isPackaged: true, platform: 'linux' })).toMatchObject({
      owner: 'unsupported',
      reason: 'unknown-installation',
      capabilities: {
        canCheck: false,
        canSelfInstall: false,
      },
    });
  });
});
