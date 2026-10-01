// DU-1401 intentionally shares this dependency-free Desktop-owned projection with release tooling.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { resolveDesktopUpdateFeedProjection } from '../../../apps/desktop/desktop-update-feed-projection.mjs';
import { validateDesktopRuntimeValidations } from './desktop-runtime-validations.mjs';
import { validateMacosTrustReceipt } from './verify-macos-trust.mjs';

/**
 * Eligibility only. DU-1402 owns file closure/copy/publication and release identity
 * verification. This reads canonical schema-2 evidence without creating evidence.
 */
export function validateDesktopUpdateFeedEligibility({ coordinates, manifest, contract }) {
  const projection = resolveDesktopUpdateFeedProjection(coordinates, contract);
  if (!projection) throw new Error('unsupported Desktop update feed coordinates');
  if (manifest?.kind !== 'desktop-release' || manifest.schemaVersion !== 2) {
    throw new Error('invalid canonical Desktop release manifest');
  }
  const evidence = manifest.platforms?.[projection.sourceReleasePlatform];
  const expectedOs = projection.platform === 'darwin' ? 'macos' : projection.platform;
  if (!evidence || evidence.os !== expectedOs || evidence.arch !== projection.arch) {
    throw new Error('Desktop update feed platform evidence mismatch');
  }
  if (!projection.eligibleSigningStates.includes(evidence.signingState)) {
    throw new Error('Desktop update feed signing state is ineligible');
  }
  const proofs = validateDesktopRuntimeValidations(evidence, projection.sourceReleasePlatform);
  if (!proofs.some((proof) => proof.executableKind === projection.requiredRuntimeExecutableKind)) {
    throw new Error('Desktop update feed runtime evidence is ineligible');
  }
  if (projection.installationKind === 'direct-signed-macos') {
    const trust = validateMacosTrustReceipt(evidence.trustValidation);
    if (trust.platform !== projection.sourceReleasePlatform || trust.arch !== projection.arch) {
      throw new Error('Desktop update feed trust evidence mismatch');
    }
  }
  if (
    !Array.isArray(evidence.assets) ||
    !evidence.assets.includes(projection.sourceMetadataAsset) ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.filter(
      (asset) =>
        asset?.platform === projection.sourceReleasePlatform &&
        asset.name === projection.sourceMetadataAsset,
    ).length !== 1
  )
    throw new Error('Desktop update feed source metadata evidence is missing or ambiguous');
  return projection;
}
