import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSON5 from 'json5';
// DU-1401 intentionally shares this dependency-free Desktop-owned projection with release tooling.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  DESKTOP_UPDATE_FEED_CONTRACT,
  validateDesktopUpdateFeedContract,
} from '../../../apps/desktop/desktop-update-feed-projection.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_RELEASE_CONFIG_PATH = path.join(repoRoot, 'apps/desktop/desktop-update-release.json');
const DEFAULT_BUILDER_CONFIG_PATH = path.join(repoRoot, 'apps/desktop/electron-builder.json5');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

validateDesktopUpdateFeedContract(DESKTOP_UPDATE_FEED_CONTRACT);

export const DESKTOP_UPDATE_METADATA_BASELINE = Object.freeze(
  Object.fromEntries(
    DESKTOP_UPDATE_FEED_CONTRACT.lanes.map((lane) => [
      lane.sourceReleasePlatform,
      Object.freeze({
        metadata: lane.sourceMetadataAsset,
        primaryArtifact: new RegExp(`${escapeRegExp(lane.primaryArtifactExtension)}$`, 'u'),
      }),
    ]),
  ),
);

function expandArtifactName(pattern, { productName, version, ext }) {
  return pattern
    .replaceAll('${productName}', productName)
    .replaceAll('${version}', version)
    .replaceAll('${ext}', ext);
}

export async function verifyDesktopUpdateReleaseConfiguration({
  releaseConfigPath = DEFAULT_RELEASE_CONFIG_PATH,
  builderConfigPath = DEFAULT_BUILDER_CONFIG_PATH,
} = {}) {
  const releaseConfig = JSON.parse(await readFile(releaseConfigPath, 'utf8'));
  const builderConfig = JSON5.parse(await readFile(builderConfigPath, 'utf8'));

  if (releaseConfig.provider !== 'github') {
    throw new Error(`unsupported Desktop update provider: ${releaseConfig.provider}`);
  }
  if (
    releaseConfig.windows?.metadata !== DESKTOP_UPDATE_METADATA_BASELINE['windows-x64'].metadata
  ) {
    throw new Error('Desktop update Windows metadata identity drift');
  }
  if (builderConfig.appId !== releaseConfig.windows?.appId) {
    throw new Error(
      `Desktop update appId drift: ${builderConfig.appId} != ${releaseConfig.windows?.appId}`,
    );
  }
  if (builderConfig.productName !== releaseConfig.windows?.productName) {
    throw new Error(
      `Desktop update productName drift: ${builderConfig.productName} != ${releaseConfig.windows?.productName}`,
    );
  }
  if (builderConfig.win?.artifactName !== releaseConfig.windows?.artifactName) {
    throw new Error('Desktop update Windows artifactName drift');
  }
  if (
    builderConfig.publish?.provider !== releaseConfig.provider ||
    builderConfig.publish?.owner !== releaseConfig.owner ||
    builderConfig.publish?.repo !== releaseConfig.repo ||
    builderConfig.publish?.releaseType !== releaseConfig.releaseType
  ) {
    throw new Error('Desktop update GitHub publish identity drift');
  }
  const builderTagNamePrefix =
    builderConfig.publish?.tagNamePrefix ??
    (builderConfig.publish?.vPrefixedTagName === false ? '' : 'v');
  if (builderTagNamePrefix !== releaseConfig.tagNamePrefix) {
    throw new Error('Desktop update GitHub tag prefix drift');
  }
  if (releaseConfig.channels?.stable !== 'latest') {
    throw new Error('Desktop update stable channel must resolve to latest metadata');
  }
  if (builderConfig.generateUpdatesFilesForAllChannels !== true) {
    throw new Error('Desktop update metadata generation must remain enabled for all channels');
  }

  const nsisTarget = Array.isArray(builderConfig.win?.target)
    ? builderConfig.win.target.find(
        (target) => typeof target === 'object' && target?.target === 'nsis',
      )
    : null;
  if (!nsisTarget || !Array.isArray(nsisTarget.arch) || !nsisTarget.arch.includes('x64')) {
    throw new Error('Desktop update Windows x64 NSIS target is missing');
  }

  return {
    provider: releaseConfig.provider,
    owner: releaseConfig.owner,
    repo: releaseConfig.repo,
    tagNamePrefix: releaseConfig.tagNamePrefix,
    releaseType: releaseConfig.releaseType,
    stableChannel: releaseConfig.channels?.stable,
    windows: {
      appId: releaseConfig.windows.appId,
      productName: releaseConfig.windows.productName,
      artifactName: releaseConfig.windows.artifactName,
      metadata: releaseConfig.windows.metadata,
    },
  };
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function metadataReferenceName(value) {
  const raw = unquote(value).split(/[?#]/u, 1)[0];
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Keep the literal value. A malformed encoded reference will fail the
    // release-asset membership check below.
  }
  return path.posix.basename(decoded.replaceAll('\\', '/'));
}

/**
 * Parse the small, stable subset of electron-builder update metadata that the
 * release gate owns. We deliberately avoid a general YAML dependency in
 * delivery tooling: electron-builder writes top-level version/path/sha512 plus
 * files[].url references, and those are the protocol fields we need to bind.
 */
export function parseElectronBuilderUpdateMetadata(source) {
  const version = source.match(/^version:\s*(.+?)\s*$/mu)?.[1];
  const primaryPath = source.match(/^path:\s*(.+?)\s*$/mu)?.[1];
  const primarySha512 = source.match(/^sha512:\s*(.+?)\s*$/mu)?.[1];
  const fileUrls = [...source.matchAll(/^\s*-\s+url:\s*(.+?)\s*$/gmu)].map((match) => match[1]);

  if (!version) throw new Error('Desktop update metadata is missing version');
  if (!primaryPath) throw new Error('Desktop update metadata is missing path');
  if (!primarySha512) throw new Error('Desktop update metadata is missing top-level sha512');
  if (fileUrls.length === 0) throw new Error('Desktop update metadata has no files[].url entries');

  const references = new Set([
    metadataReferenceName(primaryPath),
    ...fileUrls.map(metadataReferenceName),
  ]);

  return {
    version: unquote(version),
    primaryPath: metadataReferenceName(primaryPath),
    references: [...references].sort(),
  };
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

/**
 * Verify that every updater manifest required by the current Desktop release
 * matrix is present and that every artifact it references belongs to the same
 * platform receipt / canonical Desktop release manifest.
 *
 * The macOS arch-specific manifest names intentionally describe the current
 * release baseline. ADR-114 / DU-1502 will replace that workaround with
 * per-architecture feed paths that each expose canonical latest-mac.yml.
 */
export async function verifyDesktopUpdateMetadataClosure({
  manifestPath,
  artifactRoot,
  releaseConfigPath = DEFAULT_RELEASE_CONFIG_PATH,
  builderConfigPath = DEFAULT_BUILDER_CONFIG_PATH,
}) {
  const releaseConfiguration = await verifyDesktopUpdateReleaseConfiguration({
    releaseConfigPath,
    builderConfigPath,
  });
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (
    manifest.kind !== 'desktop-release' ||
    !manifest.platforms ||
    !Array.isArray(manifest.assets)
  ) {
    throw new Error('invalid Desktop release manifest');
  }

  const files = await walk(artifactRoot);
  const filesByName = new Map();
  for (const file of files) {
    const name = path.basename(file);
    const matches = filesByName.get(name) ?? [];
    matches.push(file);
    filesByName.set(name, matches);
  }

  const manifestAssetsByPlatform = new Map();
  for (const asset of manifest.assets) {
    const names = manifestAssetsByPlatform.get(asset.platform) ?? new Set();
    names.add(asset.name);
    manifestAssetsByPlatform.set(asset.platform, names);
  }

  const verified = [];

  for (const [platform, rule] of Object.entries(DESKTOP_UPDATE_METADATA_BASELINE)) {
    const platformEvidence = manifest.platforms[platform];
    if (!platformEvidence) throw new Error(`missing Desktop update platform evidence: ${platform}`);

    const platformAssetNames = manifestAssetsByPlatform.get(platform) ?? new Set();
    if (!platformAssetNames.has(rule.metadata)) {
      throw new Error(`missing Desktop update metadata for ${platform}: ${rule.metadata}`);
    }

    const metadataMatches = filesByName.get(rule.metadata) ?? [];
    if (metadataMatches.length !== 1) {
      throw new Error(
        `Desktop update metadata ${rule.metadata} resolved ${metadataMatches.length} files; expected exactly one`,
      );
    }

    const parsed = parseElectronBuilderUpdateMetadata(await readFile(metadataMatches[0], 'utf8'));
    if (parsed.version !== manifest.version) {
      throw new Error(
        `Desktop update metadata version mismatch for ${platform}: ${parsed.version} != ${manifest.version}`,
      );
    }

    for (const reference of parsed.references) {
      if (!platformAssetNames.has(reference)) {
        throw new Error(
          `Desktop update metadata ${rule.metadata} references missing ${platform} release asset: ${reference}`,
        );
      }
    }

    if (!rule.primaryArtifact.test(parsed.primaryPath)) {
      throw new Error(
        `Desktop update metadata ${rule.metadata} has unexpected primary artifact: ${parsed.primaryPath}`,
      );
    }

    if (platform === 'windows-x64') {
      const expectedWindowsInstaller = expandArtifactName(
        releaseConfiguration.windows.artifactName,
        {
          productName: releaseConfiguration.windows.productName,
          version: manifest.version,
          ext: 'exe',
        },
      );
      if (parsed.primaryPath !== expectedWindowsInstaller) {
        throw new Error(
          `Desktop update Windows installer identity drift: ${parsed.primaryPath} != ${expectedWindowsInstaller}`,
        );
      }
    }

    verified.push({
      platform,
      metadata: rule.metadata,
      primaryArtifact: parsed.primaryPath,
      references: parsed.references,
    });
  }

  return verified;
}

async function main() {
  const [manifestPath, artifactRoot] = process.argv.slice(2);
  if (!manifestPath || !artifactRoot) {
    throw new Error('usage: verify-desktop-update-metadata.mjs <desktop-manifest> <artifact-root>');
  }

  const verified = await verifyDesktopUpdateMetadataClosure({ manifestPath, artifactRoot });
  process.stdout.write(
    `DESKTOP_UPDATE_METADATA=PASS platforms=${verified.length} references=${verified.reduce(
      (total, entry) => total + entry.references.length,
      0,
    )}\n`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
