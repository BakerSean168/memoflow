/**
 * DU-1401: relative delivery coordinates, never a second release/version truth.
 * No Node/provider dependencies: release tooling and later runtime resolution
 * share this contract. Channel reservation does not enable runtime rollout.
 */
export const DESKTOP_UPDATE_FEED_CONTRACT = Object.freeze({
  kind: 'desktop-update-feed-projection',
  schemaVersion: 1,
  channels: Object.freeze(['stable', 'beta', 'canary']),
  lanes: Object.freeze([
    {
      platform: 'windows', arch: 'x64', installationKind: 'direct-nsis',
      sourceReleasePlatform: 'windows-x64', sourceMetadataAsset: 'latest.yml',
      targetMetadata: 'latest.yml', primaryArtifactExtension: '.exe',
      requiredRuntimeExecutableKind: 'packaged-exe',
      eligibleSigningStates: Object.freeze(['unsigned', 'signed']),
    },
    {
      platform: 'linux', arch: 'x64', installationKind: 'direct-appimage',
      sourceReleasePlatform: 'linux-x64', sourceMetadataAsset: 'latest-linux.yml',
      targetMetadata: 'latest-linux.yml', primaryArtifactExtension: '.AppImage',
      // Phase 6 must produce this evidence; current installed-deb proof is not equivalent.
      requiredRuntimeExecutableKind: 'packaged-appimage',
      eligibleSigningStates: Object.freeze(['unsigned']),
    },
    ...['x64', 'arm64'].map((arch) => ({
      platform: 'darwin', arch, installationKind: 'direct-signed-macos',
      sourceReleasePlatform: `macos-${arch}`, sourceMetadataAsset: `latest-mac-${arch}.yml`,
      targetMetadata: 'latest-mac.yml', primaryArtifactExtension: '.zip',
      requiredRuntimeExecutableKind: 'packaged-app',
      eligibleSigningStates: Object.freeze(['signed-notarized']),
    })),
  ].map(Object.freeze)),
});

/** Fixtures must preserve the supported contract, including evidence policy. */
export function validateDesktopUpdateFeedContract(contract) {
  if (
    !contract || contract.kind !== 'desktop-update-feed-projection' || contract.schemaVersion !== 1 ||
    !Array.isArray(contract.channels) || !Array.isArray(contract.lanes) ||
    contract.channels.length !== DESKTOP_UPDATE_FEED_CONTRACT.channels.length ||
    new Set(contract.channels).size !== contract.channels.length ||
    contract.channels.some((channel) => !DESKTOP_UPDATE_FEED_CONTRACT.channels.includes(channel))
  ) throw new Error('invalid Desktop update feed contract');

  const paths = new Set();
  for (const lane of contract.lanes) {
    if (!lane || typeof lane !== 'object') throw new Error('invalid Desktop update feed lane');
    const target = `${lane.platform}/${lane.arch}/${lane.targetMetadata}`;
    if (paths.has(target)) throw new Error(`duplicate Desktop update feed target: ${target}`);
    paths.add(target);
    const canonical = DESKTOP_UPDATE_FEED_CONTRACT.lanes.find((entry) =>
      entry.platform === lane.platform && entry.arch === lane.arch &&
      entry.installationKind === lane.installationKind);
    if (
      !canonical || Object.keys(lane).length !== Object.keys(canonical).length ||
      Object.entries(canonical).some(([key, value]) =>
        Array.isArray(value)
          ? !Array.isArray(lane[key]) || lane[key].length !== value.length ||
            value.some((state, index) => lane[key][index] !== state)
          : lane[key] !== value)
    ) throw new Error(`invalid Desktop update feed lane: ${target}`);
  }
  if (contract.lanes.length !== DESKTOP_UPDATE_FEED_CONTRACT.lanes.length) {
    throw new Error('missing Desktop update feed lanes');
  }
  return contract;
}

/** Unknown dimensions have no self-update lane. Paths have no leading slash. */
export function resolveDesktopUpdateFeedProjection(coordinates, contract = DESKTOP_UPDATE_FEED_CONTRACT) {
  validateDesktopUpdateFeedContract(contract);
  if (!coordinates || !contract.channels.includes(coordinates.channel)) return null;
  const lane = contract.lanes.find((entry) =>
    entry.platform === coordinates.platform && entry.arch === coordinates.arch &&
    entry.installationKind === coordinates.installationKind);
  if (!lane) return null;
  const targetRelativeDirectory = `${coordinates.channel}/${lane.platform}/${lane.arch}`;
  return Object.freeze({
    ...lane, channel: coordinates.channel, targetRelativeDirectory,
    targetRelativePath: `${targetRelativeDirectory}/${lane.targetMetadata}`,
  });
}
