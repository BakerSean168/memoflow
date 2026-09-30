import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DESKTOP_UPDATE_METADATA_BASELINE = Object.freeze({
  'windows-x64': Object.freeze({
    metadata: 'latest.yml',
    primaryArtifact: /\.exe$/u,
  }),
  'linux-x64': Object.freeze({
    metadata: 'latest-linux.yml',
    primaryArtifact: /\.AppImage$/u,
  }),
  'macos-x64': Object.freeze({
    metadata: 'latest-mac-x64.yml',
    primaryArtifact: /\.zip$/u,
  }),
  'macos-arm64': Object.freeze({
    metadata: 'latest-mac-arm64.yml',
    primaryArtifact: /\.zip$/u,
  }),
});

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
 * release baseline. ADR-112 / DU-1502 will replace that workaround with
 * per-architecture feed paths that each expose canonical latest-mac.yml.
 */
export async function verifyDesktopUpdateMetadataClosure({ manifestPath, artifactRoot }) {
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
