import type {
  DesktopUpdateChannelDTO,
  DesktopUpdateDisableReasonDTO,
} from '@memoflow/contracts/electron';
import {
  type DesktopUpdatePolicy,
  DesktopUpdateCoordinator,
} from '../application/desktop-update-coordinator';
import type { DesktopUpdateEngine, DesktopUpdateFeed } from '../application/desktop-update-engine';
import { resolveDesktopUpdateFeed } from '../application/desktop-update-feed';
import { ElectronUpdaterAdapter } from '../infrastructure/electron-updater.adapter';
import { resolveLinuxPackageType } from '../infrastructure/linux-package-type.resolver';
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
  readonly resourcesPath?: string;
  readonly isMacAppStore?: boolean;
  readonly isWindowsStore?: boolean;
  readonly env?: Readonly<NodeJS.ProcessEnv>;
}

export interface DesktopUpdateShellCompositionOptions {
  readonly engine?: DesktopUpdateEngine;
  readonly channel?: DesktopUpdateChannelDTO;
  readonly feedOverride?: DesktopUpdateFeed;
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
 * - deb/rpm self-identify through electron-builder's resources/package-type.
 *   Missing or invalid markers remain unsupported.
 * - direct macOS remains untrusted until the signed/notarized lane can project
 *   durable build provenance in Phase 5.
 */
export function collectDesktopInstallationEvidence(
  host: DesktopUpdateShellHost,
): DesktopInstallationEvidence {
  const env = host.env ?? process.env;
  const platform = normalizePlatform(host.platform);
  const appImage = platform === 'linux' && Boolean(env.APPIMAGE);
  const linuxPackageManager =
    platform === 'linux' && !appImage
      ? Boolean(env.SNAP)
        ? 'snap'
        : host.isPackaged
          ? resolveLinuxPackageType(host.resourcesPath)
          : undefined
      : undefined;

  return {
    isPackaged: host.isPackaged,
    platform,
    isMacAppStore: platform === 'darwin' && host.isMacAppStore === true,
    isWindowsStore: platform === 'win32' && host.isWindowsStore === true,
    portableExecutable: platform === 'win32' && Boolean(env.PORTABLE_EXECUTABLE_FILE),
    appImage,
    linuxPackageManager,
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
  const channel = options.channel ?? 'stable';
  const feed = installation.capabilities.canCheck
    ? (options.feedOverride ?? resolveDesktopUpdateFeed(channel))
    : undefined;

  const coordinator = new DesktopUpdateCoordinator({
    engine,
    currentVersion: host.currentVersion,
    channel,
    owner: installation.owner,
    capabilities: installation.capabilities,
    disabledReason: disabledReasonForInstallation(installation),
    ...(feed ? { feed } : {}),
    policy: options.policy,
  });

  return Object.freeze({ coordinator, installation });
}
