import type {
  DesktopInstallationOwnerDTO,
  DesktopUpdateCapabilitiesDTO,
} from '@memoflow/contracts/electron';
import { capabilitiesForInstallationOwner } from '../domain/installation-ownership';

export type DesktopInstallationPlatform = 'win32' | 'darwin' | 'linux' | 'other';
export type DesktopLinuxPackageManager = 'deb' | 'rpm' | 'snap';
export type DesktopMacosTrust = 'signed-notarized' | 'unsigned-pilot' | 'unknown';

/**
 * Host evidence used to decide installation authority.
 *
 * Keep this input explicit/injectable: tests and future package metadata can
 * supply stronger evidence without teaching the domain about process/env APIs.
 */
export interface DesktopInstallationEvidence {
  readonly isPackaged: boolean;
  readonly platform: DesktopInstallationPlatform;
  readonly enterpriseManaged?: boolean;
  readonly isMacAppStore?: boolean;
  readonly isWindowsStore?: boolean;
  readonly portableExecutable?: boolean;
  readonly appImage?: boolean;
  readonly linuxPackageManager?: DesktopLinuxPackageManager;
  readonly macosTrust?: DesktopMacosTrust;
}

export interface DesktopInstallationDetection {
  readonly owner: DesktopInstallationOwnerDTO;
  readonly capabilities: DesktopUpdateCapabilitiesDTO;
  readonly reason:
    | 'development-build'
    | 'enterprise-managed'
    | 'system-store'
    | 'portable'
    | 'direct-nsis'
    | 'direct-signed-macos'
    | 'direct-appimage'
    | 'package-manager'
    | 'unsupported-platform'
    | 'untrusted-macos'
    | 'unknown-installation';
}

function detection(
  owner: DesktopInstallationOwnerDTO,
  reason: DesktopInstallationDetection['reason'],
): DesktopInstallationDetection {
  return Object.freeze({
    owner,
    capabilities: capabilitiesForInstallationOwner(owner),
    reason,
  });
}

/**
 * Fail-closed installation owner detector (ADR-114 / DU-1102).
 *
 * Platform alone is insufficient. Store/package-manager/portable provenance
 * takes precedence over OS defaults, and unsigned/unknown direct macOS builds
 * are intentionally not granted self-install authority.
 */
export function detectDesktopInstallationOwner(
  evidence: DesktopInstallationEvidence,
): DesktopInstallationDetection {
  if (!evidence.isPackaged) {
    return detection('unsupported', 'development-build');
  }

  if (evidence.enterpriseManaged) {
    return detection('enterprise-managed', 'enterprise-managed');
  }

  if (
    (evidence.platform === 'darwin' && evidence.isMacAppStore) ||
    (evidence.platform === 'win32' && evidence.isWindowsStore)
  ) {
    return detection('system-store', 'system-store');
  }

  if (evidence.portableExecutable) {
    return detection('portable', 'portable');
  }

  if (evidence.platform === 'win32') {
    return detection('memoflow-direct', 'direct-nsis');
  }

  if (evidence.platform === 'darwin') {
    if (evidence.macosTrust === 'signed-notarized') {
      return detection('memoflow-direct', 'direct-signed-macos');
    }
    return detection('unsupported', 'untrusted-macos');
  }

  if (evidence.platform === 'linux') {
    if (evidence.appImage) {
      return detection('memoflow-direct', 'direct-appimage');
    }
    if (evidence.linuxPackageManager) {
      return detection('package-manager', 'package-manager');
    }
    return detection('unsupported', 'unknown-installation');
  }

  return detection('unsupported', 'unsupported-platform');
}
