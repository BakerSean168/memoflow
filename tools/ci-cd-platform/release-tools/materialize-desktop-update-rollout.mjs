import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
// DU-1401/1403 share dependency-free Desktop-owned contracts with release tooling.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { resolveDesktopUpdateFeedProjection } from '../../../apps/desktop/desktop-update-feed-projection.mjs';
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  describeDesktopUpdateRolloutTransition,
  normalizeDesktopUpdateRolloutControl,
} from '../../../apps/desktop/desktop-update-rollout.mjs';
import { parseElectronBuilderUpdateMetadata } from './verify-desktop-update-metadata.mjs';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeSegment(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]+$/u.test(value) || value === '.' || value === '..') {
    throw new Error(`unsafe Desktop update rollout ${label}`);
  }
  return value;
}

function safeRelativePath(value, label) {
  if (typeof value !== 'string' || value.startsWith('/') || value.includes('\\')) {
    throw new Error(`unsafe Desktop update rollout ${label}`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`unsafe Desktop update rollout ${label}`);
  }
  return segments.join('/');
}

function resolveInside(root, relative, label) {
  const safe = safeRelativePath(relative, label);
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, ...safe.split('/'));
  if (!absolute.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error(`Desktop update rollout ${label} escaped root`);
  }
  return absolute;
}

export function projectDesktopUpdateRolloutMetadata(source, control) {
  const normalized = normalizeDesktopUpdateRolloutControl(control);
  if (/^stagingPercentage\s*:/mu.test(source)) {
    throw new Error('canonical Desktop update metadata must not contain stagingPercentage');
  }

  const lines = source.split('\n');
  const versionIndexes = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^version\s*:/u.test(lines[index])) versionIndexes.push(index);
  }
  if (versionIndexes.length !== 1) {
    throw new Error('Desktop update rollout metadata must contain exactly one top-level version');
  }

  lines.splice(
    versionIndexes[0] + 1,
    0,
    `stagingPercentage: ${normalized.effectiveStagingPercentage}`,
  );
  return lines.join('\n');
}

function validateFileEvidence(file, expectedPrefix) {
  if (
    !file ||
    !['metadata', 'artifact', 'blockmap'].includes(file.role) ||
    typeof file.targetRelativePath !== 'string' ||
    typeof file.sourcePlatform !== 'string' ||
    typeof file.sourceAsset !== 'string' ||
    typeof file.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(file.sha256) ||
    !Number.isInteger(file.size) ||
    file.size <= 0
  ) {
    throw new Error('invalid Desktop update feed publication file evidence');
  }

  safeSegment(file.sourcePlatform, 'source platform');
  safeSegment(file.sourceAsset, 'source asset');
  const targetRelativePath = safeRelativePath(file.targetRelativePath, 'publication file path');
  if (!targetRelativePath.startsWith(`${expectedPrefix}/`)) {
    throw new Error('Desktop update feed publication file escaped its lane prefix');
  }
  if (targetRelativePath.slice(0, targetRelativePath.lastIndexOf('/')) !== expectedPrefix) {
    throw new Error('Desktop update feed publication file must be a direct lane child');
  }
  return targetRelativePath;
}

function validatePublicationReceipt(receipt) {
  if (
    !receipt ||
    receipt.kind !== 'desktop-update-feed-publication' ||
    receipt.schemaVersion !== 1 ||
    receipt.strategy !== 'versioned-prefix-pointer-switch' ||
    !receipt.release ||
    typeof receipt.release.version !== 'string' ||
    typeof receipt.release.tag !== 'string' ||
    typeof receipt.release.gitSha !== 'string' ||
    typeof receipt.channel !== 'string' ||
    typeof receipt.versionedPrefix !== 'string' ||
    !receipt.pointer ||
    !Array.isArray(receipt.lanes) ||
    receipt.lanes.length === 0
  ) {
    throw new Error('invalid Desktop update feed publication receipt');
  }

  const tag = safeSegment(receipt.release.tag, 'release tag');
  const gitSha = safeSegment(receipt.release.gitSha, 'git SHA');
  const channel = safeSegment(receipt.channel, 'channel');
  if (!/^[a-f0-9]{40}$/u.test(gitSha)) {
    throw new Error('invalid Desktop update feed publication Git SHA');
  }
  if (tag.replace(/^v/u, '') !== receipt.release.version) {
    throw new Error('Desktop update rollout release identity drift');
  }

  const expectedVersionedPrefix = `versions/${tag}/${gitSha}`;
  if (
    safeRelativePath(receipt.versionedPrefix, 'versioned prefix') !== expectedVersionedPrefix ||
    receipt.pointer.name !== channel ||
    safeRelativePath(receipt.pointer.targetPrefix, 'pointer target prefix') !==
      `${expectedVersionedPrefix}/${channel}`
  ) {
    throw new Error('Desktop update feed publication pointer identity drift');
  }

  const laneCoordinates = new Set();
  const targetPaths = new Set();
  for (const lane of receipt.lanes) {
    if (
      !lane ||
      typeof lane.platform !== 'string' ||
      typeof lane.arch !== 'string' ||
      typeof lane.installationKind !== 'string' ||
      typeof lane.sourceReleasePlatform !== 'string' ||
      typeof lane.sourceMetadataAsset !== 'string' ||
      typeof lane.targetMetadata !== 'string' ||
      typeof lane.targetRelativeDirectory !== 'string' ||
      !Array.isArray(lane.files) ||
      lane.files.length === 0
    ) {
      throw new Error('invalid Desktop update feed publication lane');
    }

    const platform = safeSegment(lane.platform, 'platform');
    const arch = safeSegment(lane.arch, 'arch');
    const installationKind = safeSegment(lane.installationKind, 'installation kind');
    const sourceReleasePlatform = safeSegment(
      lane.sourceReleasePlatform,
      'source release platform',
    );
    const sourceMetadataAsset = safeSegment(lane.sourceMetadataAsset, 'source metadata asset');
    const targetMetadata = safeSegment(lane.targetMetadata, 'target metadata');
    const expectedDirectory = `${channel}/${platform}/${arch}`;
    if (
      safeRelativePath(lane.targetRelativeDirectory, 'target relative directory') !==
      expectedDirectory
    ) {
      throw new Error('Desktop update feed publication lane directory drift');
    }

    const projection = resolveDesktopUpdateFeedProjection({
      channel,
      platform,
      arch,
      installationKind,
    });
    if (
      !projection ||
      projection.sourceReleasePlatform !== sourceReleasePlatform ||
      projection.sourceMetadataAsset !== sourceMetadataAsset ||
      projection.targetMetadata !== targetMetadata ||
      projection.targetRelativeDirectory !== expectedDirectory
    ) {
      throw new Error('Desktop update feed publication lane contract drift');
    }

    const coordinate = `${platform}/${arch}/${installationKind}`;
    if (laneCoordinates.has(coordinate)) {
      throw new Error('duplicate Desktop update feed publication lane');
    }
    laneCoordinates.add(coordinate);

    const expectedLanePrefix = `${expectedVersionedPrefix}/${expectedDirectory}`;
    const metadataFiles = lane.files.filter((file) => file?.role === 'metadata');
    if (metadataFiles.length !== 1) {
      throw new Error(
        'Desktop update rollout requires exactly one publication metadata file per lane',
      );
    }

    for (const file of lane.files) {
      const targetRelativePath = validateFileEvidence(file, expectedLanePrefix);
      if (file.sourcePlatform !== sourceReleasePlatform) {
        throw new Error('Desktop update feed publication source platform drift');
      }
      if (
        file.role !== 'metadata' &&
        targetRelativePath.slice(targetRelativePath.lastIndexOf('/') + 1) !== file.sourceAsset
      ) {
        throw new Error('Desktop update feed publication artifact identity drift');
      }
      if (targetPaths.has(targetRelativePath)) {
        throw new Error('duplicate Desktop update feed publication target');
      }
      targetPaths.add(targetRelativePath);
    }

    if (
      metadataFiles[0].targetRelativePath !== `${expectedLanePrefix}/${targetMetadata}` ||
      metadataFiles[0].sourceAsset !== sourceMetadataAsset
    ) {
      throw new Error('Desktop update feed publication metadata path drift');
    }
  }

  return receipt;
}

export async function materializeDesktopUpdateRollout({
  publicationReceiptPath,
  feedRoot,
  outputRoot,
  control,
  previousControl = null,
}) {
  const publicationBytes = await readFile(publicationReceiptPath);
  const publication = validatePublicationReceipt(JSON.parse(publicationBytes.toString('utf8')));
  const normalized = normalizeDesktopUpdateRolloutControl(control);
  const transition = describeDesktopUpdateRolloutTransition(previousControl, control);
  const controlPrefix = [
    'controls',
    safeSegment(publication.release.tag, 'release tag'),
    safeSegment(publication.release.gitSha, 'git SHA'),
    safeSegment(publication.channel, 'channel'),
    safeSegment(normalized.controlName, 'control name'),
  ].join('/');

  const lanes = [];
  for (const lane of publication.lanes) {
    if (!lane || !Array.isArray(lane.files)) {
      throw new Error('invalid Desktop update feed publication lane');
    }
    const metadataFiles = lane.files.filter((file) => file?.role === 'metadata');
    if (metadataFiles.length !== 1) {
      throw new Error('Desktop update rollout requires exactly one publication metadata file per lane');
    }
    const metadata = metadataFiles[0];
    const sourceRelativePath = safeRelativePath(metadata.targetRelativePath, 'source metadata path');
    if (!sourceRelativePath.startsWith(`${publication.versionedPrefix}/`)) {
      throw new Error('Desktop update rollout metadata is outside the bound publication prefix');
    }
    const sourcePath = resolveInside(feedRoot, sourceRelativePath, 'source metadata path');
    const sourceBytes = await readFile(sourcePath);
    if (
      !/^[a-f0-9]{64}$/u.test(metadata.sha256) ||
      !Number.isInteger(metadata.size) ||
      metadata.size <= 0 ||
      (await stat(sourcePath)).size !== metadata.size ||
      digest(sourceBytes) !== metadata.sha256
    ) {
      throw new Error('Desktop update rollout source metadata identity mismatch');
    }

    const source = sourceBytes.toString('utf8');
    if (parseElectronBuilderUpdateMetadata(source).version !== publication.release.version) {
      throw new Error('Desktop update rollout release identity drift');
    }
    const projected = projectDesktopUpdateRolloutMetadata(source, control);
    const platform = safeSegment(lane.platform, 'platform');
    const arch = safeSegment(lane.arch, 'arch');
    const targetMetadata = safeSegment(lane.targetMetadata, 'target metadata');
    const controlMetadataRelativePath = `${controlPrefix}/${platform}/${arch}/${targetMetadata}`;
    const controlMetadataPath = resolveInside(
      outputRoot,
      controlMetadataRelativePath,
      'control metadata path',
    );
    await mkdir(path.dirname(controlMetadataPath), { recursive: true });
    await writeFile(controlMetadataPath, projected);

    lanes.push({
      platform,
      arch,
      installationKind: lane.installationKind,
      sourceMetadataRelativePath: sourceRelativePath,
      sourceMetadataSha256: metadata.sha256,
      sourceMetadataSize: metadata.size,
      controlMetadataRelativePath,
      controlMetadataSha256: digest(projected),
      controlMetadataSize: Buffer.byteLength(projected),
      liveTargetRelativePath: `${publication.channel}/${platform}/${arch}/${targetMetadata}`,
      artifactSourcePrefix:
        `${publication.versionedPrefix}/${publication.channel}/${platform}/${arch}`,
    });
  }

  const receipt = {
    schemaVersion: 1,
    kind: 'desktop-update-rollout-control',
    release: publication.release,
    channel: publication.channel,
    sourcePublication: {
      receiptSha256: digest(publicationBytes),
      versionedPrefix: publication.versionedPrefix,
    },
    control: normalized,
    transition,
    metadataProjection: 'electron-updater-stagingPercentage-v1',
    strategy: 'immutable-control-metadata-plus-atomic-channel-pointer',
    controlPrefix,
    lanes: lanes.sort((left, right) =>
      `${left.platform}/${left.arch}`.localeCompare(`${right.platform}/${right.arch}`)),
  };

  await mkdir(outputRoot, { recursive: true });
  const receiptPath = path.join(outputRoot, 'desktop-update-rollout-control.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt, receiptPath };
}

function parseControlArgument(value) {
  if (value === 'pause' || value === 'paused') return { state: 'paused' };
  return { state: 'active', percentage: Number(value) };
}

async function main() {
  const [
    publicationReceiptPath,
    feedRoot,
    outputRoot,
    controlArgument,
    previousControlArgument,
  ] = process.argv.slice(2);
  if (!publicationReceiptPath || !feedRoot || !outputRoot || !controlArgument) {
    throw new Error(
      'usage: materialize-desktop-update-rollout.mjs <publication-receipt> <feed-root> <output-root> <pause|10|30|50|100> [previous:pause|10|30|50|100]',
    );
  }

  const { receipt } = await materializeDesktopUpdateRollout({
    publicationReceiptPath,
    feedRoot,
    outputRoot,
    control: parseControlArgument(controlArgument),
    previousControl: previousControlArgument
      ? parseControlArgument(previousControlArgument)
      : null,
  });
  process.stdout.write(
    `DESKTOP_UPDATE_ROLLOUT=PASS control=${receipt.control.controlName} action=${receipt.transition.action} lanes=${receipt.lanes.length} release=${receipt.release.version}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  await main();
}
