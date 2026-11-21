/** Type surface for the shared, runtime-neutral release projection contract. */
export interface DesktopUpdateFeedLane {
  readonly platform: 'windows' | 'linux' | 'darwin';
  readonly arch: 'x64' | 'arm64';
  readonly installationKind: string;
  readonly sourceReleasePlatform: string;
  readonly sourceMetadataAsset: string;
  readonly targetMetadata: string;
  readonly primaryArtifactExtension: string;
  readonly requiredRuntimeExecutableKind: string;
  readonly eligibleSigningStates: readonly string[];
}

export declare const DESKTOP_UPDATE_FEED_CONTRACT: Readonly<{
  kind: 'desktop-update-feed-projection';
  schemaVersion: 1;
  channels: readonly string[];
  lanes: readonly DesktopUpdateFeedLane[];
}>;

export declare function validateDesktopUpdateFeedContract(
  contract: typeof DESKTOP_UPDATE_FEED_CONTRACT,
): typeof DESKTOP_UPDATE_FEED_CONTRACT;

export declare function resolveDesktopUpdateFeedProjection(
  coordinates: {
    channel: string;
    platform: string;
    arch: string;
    installationKind: string;
  },
  contract?: typeof DESKTOP_UPDATE_FEED_CONTRACT,
):
  | (DesktopUpdateFeedLane & {
      readonly channel: string;
      readonly targetRelativeDirectory: string;
      readonly targetRelativePath: string;
    })
  | null;
