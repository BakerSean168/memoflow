import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  resolveDesktopPlatformAssetFile,
  walkDesktopArtifactFiles,
} from './desktop-release-asset-resolution.mjs';
// DU-1401/1402 intentionally share this dependency-free Desktop-owned projection with release tooling.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { DESKTOP_UPDATE_FEED_CONTRACT, validateDesktopUpdateFeedContract } from '../../../apps/desktop/desktop-update-feed-projection.mjs';
import { validateDesktopUpdateFeedEligibility } from './validate-desktop-update-feed-eligibility.mjs';
import { parseElectronBuilderUpdateMetadata } from './verify-desktop-update-metadata.mjs';

const EXPECTED_INELIGIBLE = new Set([
  'Desktop update feed signing state is ineligible',
  'Desktop update feed runtime evidence is ineligible',
]);

function safeSegment(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]+$/u.test(value) || value === '.' || value === '..') {
    throw new Error(`unsafe Desktop update feed ${label}`);
  }
  return value;
}

function validateLocalReferences(source) {
  const values = [
    ...[...source.matchAll(/^path:\s*(.+?)\s*$/gmu)].map((match) => match[1]),
    ...[...source.matchAll(/^\s*-\s+url:\s*(.+?)\s*$/gmu)].map((match) => match[1]),
  ];
  for (const raw of values) {
    const trimmed = raw.trim().replace(/^(['"])(.*)\1$/u, '$2').split(/[?#]/u, 1)[0];
    let decoded;
    try { decoded = decodeURIComponent(trimmed); } catch { decoded = ''; }
    if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) {
      throw new Error(`unsafe Desktop update metadata reference: ${raw.trim()}`);
    }
  }
}

async function buildAssetIndex(manifest, artifactRoot) {
  const files = await walkDesktopArtifactFiles(artifactRoot);
  const assets = new Map();
  for (const asset of manifest.assets) {
    if (!asset || typeof asset.platform !== 'string' || typeof asset.name !== 'string' ||
        typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(asset.sha256) ||
        !Number.isInteger(asset.size) || asset.size <= 0) {
      throw new Error('invalid canonical Desktop release asset evidence');
    }
    safeSegment(asset.name, 'asset name');
    const key = `${asset.platform}\0${asset.name}`;
    if (assets.has(key)) throw new Error(`ambiguous canonical Desktop release asset: ${asset.platform}/${asset.name}`);
    const file = resolveDesktopPlatformAssetFile({
      artifactRoot,
      files,
      platform: asset.platform,
      name: asset.name,
    });
    const body = await readFile(file);
    if ((await stat(file)).size !== asset.size ||
        createHash('sha256').update(body).digest('hex') !== asset.sha256) {
      throw new Error(`Desktop update feed canonical asset identity mismatch: ${asset.name}`);
    }
    assets.set(key, { ...asset, file });
  }
  return assets;
}

function requireAsset(assets, platform, name) {
  const asset = assets.get(`${platform}\0${name}`);
  if (!asset) throw new Error(`Desktop update feed reference is not canonical: ${platform}/${name}`);
  return asset;
}

function fileEvidence(targetRelativePath, asset, role) {
  return {
    role,
    targetRelativePath,
    sourcePlatform: asset.platform,
    sourceAsset: asset.name,
    sha256: asset.sha256,
    size: asset.size,
  };
}

export async function materializeDesktopUpdateFeed({
  manifestPath,
  artifactRoot,
  outputRoot,
  channel = 'stable',
  contract = DESKTOP_UPDATE_FEED_CONTRACT,
}) {
  validateDesktopUpdateFeedContract(contract);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest?.kind !== 'desktop-release' || manifest.schemaVersion !== 2 ||
      typeof manifest.version !== 'string' || typeof manifest.tag !== 'string' ||
      typeof manifest.gitSha !== 'string' || !manifest.platforms || !Array.isArray(manifest.assets)) {
    throw new Error('invalid canonical Desktop release manifest');
  }
  if (manifest.tag.replace(/^v/u, '') !== manifest.version) {
    throw new Error('Desktop update feed release identity drift');
  }
  if (!contract.channels.includes(channel)) throw new Error(`unsupported Desktop update feed channel: ${channel}`);
  const tag = safeSegment(manifest.tag, 'release tag');
  const gitSha = safeSegment(manifest.gitSha, 'git SHA');
  const versionedPrefix = `versions/${tag}/${gitSha}`;
  const assets = await buildAssetIndex(manifest, artifactRoot);
  const targets = new Map();
  const lanes = [];
  const skippedLanes = [];

  for (const lane of contract.lanes) {
    const coordinates = { channel, platform: lane.platform, arch: lane.arch, installationKind: lane.installationKind };
    let projection;
    try {
      projection = validateDesktopUpdateFeedEligibility({ coordinates, manifest, contract });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!EXPECTED_INELIGIBLE.has(message)) throw error;
      skippedLanes.push({ platform: lane.platform, arch: lane.arch, installationKind: lane.installationKind, reason: message });
      continue;
    }

    const metadataAsset = requireAsset(assets, projection.sourceReleasePlatform, projection.sourceMetadataAsset);
    const metadataSource = await readFile(metadataAsset.file, 'utf8');
    validateLocalReferences(metadataSource);
    const parsed = parseElectronBuilderUpdateMetadata(metadataSource);
    if (parsed.version !== manifest.version) {
      throw new Error(`Desktop update feed metadata version mismatch: ${parsed.version} != ${manifest.version}`);
    }

    const directory = `${versionedPrefix}/${projection.targetRelativeDirectory}`;
    const files = [];
    const metadataTarget = `${directory}/${projection.targetMetadata}`;
    targets.set(metadataTarget, { source: metadataAsset.file, asset: metadataAsset });
    files.push(fileEvidence(metadataTarget, metadataAsset, 'metadata'));

    const references = new Set(parsed.references);
    for (const reference of parsed.references) {
      const blockmap = `${reference}.blockmap`;
      if (assets.has(`${projection.sourceReleasePlatform}\0${blockmap}`)) references.add(blockmap);
    }
    for (const reference of [...references].sort()) {
      const asset = requireAsset(assets, projection.sourceReleasePlatform, reference);
      const target = `${directory}/${reference}`;
      const existing = targets.get(target);
      if (existing && existing.asset.name !== asset.name) throw new Error(`conflicting Desktop update feed target: ${target}`);
      targets.set(target, { source: asset.file, asset });
      files.push(fileEvidence(target, asset, reference.endsWith('.blockmap') ? 'blockmap' : 'artifact'));
    }

    lanes.push({
      platform: projection.platform,
      arch: projection.arch,
      installationKind: projection.installationKind,
      sourceReleasePlatform: projection.sourceReleasePlatform,
      sourceMetadataAsset: projection.sourceMetadataAsset,
      targetMetadata: projection.targetMetadata,
      targetRelativeDirectory: projection.targetRelativeDirectory,
      files: files.sort((a, b) => a.targetRelativePath.localeCompare(b.targetRelativePath)),
    });
  }

  if (lanes.length === 0) throw new Error('no eligible Desktop update feed lanes');

  await rm(outputRoot, { recursive: true, force: true });
  for (const [relative, planned] of [...targets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const destination = path.resolve(outputRoot, ...relative.split('/'));
    const root = path.resolve(outputRoot);
    if (!destination.startsWith(`${root}${path.sep}`)) throw new Error(`Desktop update feed target escaped output root: ${relative}`);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(planned.source, destination);
  }

  const receipt = {
    schemaVersion: 1,
    kind: 'desktop-update-feed-publication',
    release: { version: manifest.version, tag: manifest.tag, gitSha: manifest.gitSha },
    channel,
    strategy: 'versioned-prefix-pointer-switch',
    versionedPrefix,
    pointer: { name: channel, targetPrefix: `${versionedPrefix}/${channel}` },
    lanes: lanes.sort((a, b) => `${a.platform}/${a.arch}`.localeCompare(`${b.platform}/${b.arch}`)),
    skippedLanes: skippedLanes.sort((a, b) => `${a.platform}/${a.arch}`.localeCompare(`${b.platform}/${b.arch}`)),
  };
  await mkdir(outputRoot, { recursive: true });
  const receiptPath = path.join(outputRoot, 'desktop-update-feed-publication.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt, receiptPath };
}

async function main() {
  const [manifestPath, artifactRoot, outputRoot, channel = 'stable'] = process.argv.slice(2);
  if (!manifestPath || !artifactRoot || !outputRoot) {
    throw new Error('usage: materialize-desktop-update-feed.mjs <desktop-manifest> <artifact-root> <output-root> [channel]');
  }
  const { receipt } = await materializeDesktopUpdateFeed({
    manifestPath,
    artifactRoot,
    outputRoot,
    channel,
  });
  process.stdout.write(`DESKTOP_UPDATE_FEED=PASS channel=${receipt.channel} lanes=${receipt.lanes.length} prefix=${receipt.versionedPrefix}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  await main();
}
