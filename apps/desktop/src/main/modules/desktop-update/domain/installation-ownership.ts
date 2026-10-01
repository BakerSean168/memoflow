import type {
  DesktopInstallationOwnerDTO,
  DesktopUpdateCapabilitiesDTO,
} from '@memoflow/contracts/electron';

const CAPABILITIES_BY_OWNER: Readonly<
  Record<DesktopInstallationOwnerDTO, DesktopUpdateCapabilitiesDTO>
> = Object.freeze({
  'memoflow-direct': Object.freeze({
    canCheck: true,
    canBackgroundCheck: true,
    canDownload: true,
    canSelfInstall: true,
    canAutoDownload: true,
    installAuthority: 'memoflow',
  }),
  'system-store': Object.freeze({
    canCheck: false,
    canBackgroundCheck: false,
    canDownload: false,
    canSelfInstall: false,
    canAutoDownload: false,
    installAuthority: 'system',
  }),
  'package-manager': Object.freeze({
    canCheck: true,
    canBackgroundCheck: true,
    canDownload: false,
    canSelfInstall: false,
    canAutoDownload: false,
    installAuthority: 'package-manager',
  }),
  portable: Object.freeze({
    canCheck: true,
    canBackgroundCheck: true,
    canDownload: false,
    canSelfInstall: false,
    canAutoDownload: false,
    installAuthority: 'none',
  }),
  'enterprise-managed': Object.freeze({
    canCheck: false,
    canBackgroundCheck: false,
    canDownload: false,
    canSelfInstall: false,
    canAutoDownload: false,
    installAuthority: 'administrator',
  }),
  unsupported: Object.freeze({
    canCheck: false,
    canBackgroundCheck: false,
    canDownload: false,
    canSelfInstall: false,
    canAutoDownload: false,
    installAuthority: 'none',
  }),
});

/** Project installation ownership into renderer-safe updater capabilities. */
export function capabilitiesForInstallationOwner(
  owner: DesktopInstallationOwnerDTO,
): DesktopUpdateCapabilitiesDTO {
  return CAPABILITIES_BY_OWNER[owner];
}
