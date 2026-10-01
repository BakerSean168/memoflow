import { readdir } from 'node:fs/promises';
import path from 'node:path';

function assertAssetCoordinate(asset) {
  if (
    !asset ||
    typeof asset !== 'object' ||
    typeof asset.platform !== 'string' ||
    asset.platform.length === 0 ||
    typeof asset.name !== 'string' ||
    asset.name.length === 0 ||
    path.basename(asset.name) !== asset.name
  ) {
    throw new Error('invalid Desktop release asset coordinate');
  }
}

export async function walkDesktopArtifactFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkDesktopArtifactFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function belongsToPlatform(file, artifactRoot, platform) {
  const relative = path.relative(artifactRoot, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  const segments = relative.split(path.sep);
  return segments.includes(platform) || segments.includes(`desktop-${platform}`);
}

export function resolveDesktopPlatformAssetFile({
  artifactRoot,
  files,
  platform,
  name,
}) {
  assertAssetCoordinate({ platform, name });
  const matches = files.filter(
    (file) => path.basename(file) === name && belongsToPlatform(file, artifactRoot, platform),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Desktop release asset ${platform}/${name} resolved ${matches.length} files; expected exactly one`,
    );
  }
  return matches[0];
}
