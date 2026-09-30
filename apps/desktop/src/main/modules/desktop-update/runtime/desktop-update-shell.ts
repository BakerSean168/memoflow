import type { DesktopUpdateDisableReasonDTO } from '@memoflow/contracts/electron';
import {
  type DesktopUpdatePolicy,
  DesktopUpdateCoordinator,
} from '../application/desktop-update-coordinator';
import type { DesktopUpdateEngine } from '../application/desktop-update-engine';
import { ElectronUpdaterAdapter } from '../infrastructure/electron-updater.adapter';
import {
  detectDesktopInstallationOwner,
  type DesktopInstallationDetection,
  type DesktopInstallationEvidence,
  type DesktopInstallationPlatform,
} from '../infrastructure/installation-owner.detector';

export interface DesktopUpdateShellHost {
  readonly currentVersion: string;
  readonly isPackaged: boolean;
  readonly platform: NodeJS.Platform | string;
  readonly isMacAppStore?: boolean;
  readonly isWindowsStore?: boolean;
  readonly env?: Readonly<NodeJS.ProcessEnv>;
}

export interface DesktopUpdateShellCompositionOptions {
  readonly engine?: DesktopUpdateEngine;
  readonly policy?: Partial<DesktopUpdatePolicy>;
}

export interface DesktopUpdateShellRuntime {
  readonly coordinator: DesktopUpdateCoordinator;
  readonly installation: DesktopInstallationDetection;
}

function normalizePlatform(platform: string): DesktopInstallationPlatform {
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux') return platform;
  return 'other';
}

/**
 * Translate process/runtime evidence into installation ownership.
 *
 * Keep this conservative:
 * - AppImage self-identifies through APPIMAGE.
 * - Snap self-identifies through SNAP and remains package-manager owned.
 * - deb/rpm do not expose a trustworthy generic runtime marker, so they stay
 *   unsupported until DU-1602 adds package-specific ownership evidence.
 * - direct macOS remains untrusted until the signed/notarized lane can project
 *   durable build provenance in Phase 5.
 */
export function collectDesktopInstallationEvidence(
  host: DesktopUpdateShellHost,
): DesktopInstallationEvidence {
  const env = host.env ?? process.env;
  const platform = normalizePlatform(host.platform);

  return {
    isPackaged: host.isPackaged,
    platform,
    isMacAppStore: platform === 'darwin' && host.isMacAppStore === true,
    isWindowsStore: platform === 'win32' && host.isWindowsStore === true,
    portableExecutable: platform === 'win32' && Boolean(env.PORTABLE_EXECUTABLE_FILE),
    appImage: platform === 'linux' && Boolean(env.APPIMAGE),
    linuxPackageManager: platform === 'linux' && Boolean(env.SNAP) ? 'snap' : undefined,
    macosTrust: platform === 'darwin' ? 'unknown' : undefined,
  };
}

export function disabledReasonForInstallation(
  installation: DesktopInstallationDetection,
): DesktopUpdateDisableReasonDTO | undefined {
  if (installation.reason === 'development-build') return 'development-build';
  if (installation.owner === 'unsupported') return 'unsupported-installation';
  return undefined;
}

/**
 * Compose the process-owned Desktop Update runtime once at the Desktop Shell
 * boundary. No Profile, Window, renderer, or PowerSync dependency is accepted.
 */
export function composeDesktopUpdateShellRuntime(
  host: DesktopUpdateShellHost,
  options: DesktopUpdateShellCompositionOptions = {},
): DesktopUpdateShellRuntime {
  const installation = detectDesktopInstallationOwner(collectDesktopInstallationEvidence(host));
  const engine = options.engine ?? new ElectronUpdaterAdapter();

  const coordinator = new DesktopUpdateCoordinator({
    engine,
    currentVersion: host.currentVersion,
    owner: installation.owner,
    capabilities: installation.capabilities,
    disabledReason: disabledReasonForInstallation(installation),
    policy: options.policy,
  });

  return Object.freeze({ coordinator, installation });
}
