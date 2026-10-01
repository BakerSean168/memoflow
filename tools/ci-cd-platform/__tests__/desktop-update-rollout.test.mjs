import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
// DU-1403 intentionally shares this dependency-free Desktop-owned rollout contract with release tooling.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  DESKTOP_UPDATE_ROLLOUT_PERCENTAGES,
  describeDesktopUpdateRolloutTransition,
  desktopUpdateRolloutBucket,
  isDesktopUpdateRolloutEligible,
  normalizeDesktopUpdateRolloutControl,
} from '../../../apps/desktop/desktop-update-rollout.mjs';
import {
  materializeDesktopUpdateRollout,
  projectDesktopUpdateRolloutMetadata,
} from '../release-tools/materialize-desktop-update-rollout.mjs';

const installations = Object.freeze({
  veryLow: '00000000-0000-4000-8000-000000000001',
  low: '00000000-0000-4000-8000-000030000000',
  medium: '00000000-0000-4000-8000-000070000000',
  high: '00000000-0000-4000-8000-0000e0000000',
});

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function electronUpdaterReferenceBucket(installationId) {
  const bytes = Buffer.from(installationId.replaceAll('-', ''), 'hex');
  return bytes.readUInt32BE(12) / 0xffffffff;
}

async function createPublicationFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memoflow-rollout-'));
  const feedRoot = path.join(root, 'feed');
  const sourceRelativePath =
    'versions/v1.2.3/0123456789abcdef0123456789abcdef01234567/stable/windows/x64/latest.yml';
  const sourcePath = path.join(feedRoot, ...sourceRelativePath.split('/'));
  const source = [
    'version: 1.2.3',
    'files:',
    '  - url: MemoFlow-Windows-1.2.3-Setup.exe',
    '    sha512: fixture',
    'path: MemoFlow-Windows-1.2.3-Setup.exe',
    'sha512: fixture',
    '',
  ].join('\n');
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, source);

  const receipt = {
    schemaVersion: 1,
    kind: 'desktop-update-feed-publication',
    release: {
      version: '1.2.3',
      tag: 'v1.2.3',
      gitSha: '0123456789abcdef0123456789abcdef01234567',
    },
    channel: 'stable',
    strategy: 'versioned-prefix-pointer-switch',
    versionedPrefix: 'versions/v1.2.3/0123456789abcdef0123456789abcdef01234567',
    pointer: {
      name: 'stable',
      targetPrefix:
        'versions/v1.2.3/0123456789abcdef0123456789abcdef01234567/stable',
    },
    lanes: [
      {
        platform: 'windows',
        arch: 'x64',
        installationKind: 'direct-nsis',
        sourceReleasePlatform: 'windows-x64',
        sourceMetadataAsset: 'latest.yml',
        targetMetadata: 'latest.yml',
        targetRelativeDirectory: 'stable/windows/x64',
        files: [
          {
            role: 'metadata',
            targetRelativePath: sourceRelativePath,
            sourcePlatform: 'windows-x64',
            sourceAsset: 'latest.yml',
            sha256: digest(source),
            size: Buffer.byteLength(source),
          },
        ],
      },
    ],
    skippedLanes: [],
  };
  const publicationReceiptPath = path.join(feedRoot, 'desktop-update-feed-publication.json');
  await writeFile(publicationReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { root, feedRoot, sourcePath, source, publicationReceiptPath };
}

test('rollout stages are explicit and operator pause maps to zero percent', () => {
  assert.deepEqual(DESKTOP_UPDATE_ROLLOUT_PERCENTAGES, [10, 30, 50, 100]);
  assert.deepEqual(normalizeDesktopUpdateRolloutControl({ state: 'paused' }), {
    state: 'paused',
    effectiveStagingPercentage: 0,
    operatorAction: 'pause',
    controlName: 'paused',
  });
  assert.equal(
    normalizeDesktopUpdateRolloutControl({ state: 'active', percentage: 30 })
      .effectiveStagingPercentage,
    30,
  );
  assert.throws(
    () => normalizeDesktopUpdateRolloutControl({ state: 'active', percentage: 25 }),
    /invalid Desktop update rollout control/u,
  );
});

test('rollout transitions make decrease, pause, and resume explicit operator actions', () => {
  assert.deepEqual(
    describeDesktopUpdateRolloutTransition(
      { state: 'active', percentage: 50 },
      { state: 'active', percentage: 30 },
    ),
    { action: 'decrease', fromControlName: 'p50', toControlName: 'p30' },
  );
  assert.deepEqual(
    describeDesktopUpdateRolloutTransition(
      { state: 'active', percentage: 30 },
      { state: 'paused' },
    ),
    { action: 'pause', fromControlName: 'p30', toControlName: 'paused' },
  );
  assert.deepEqual(
    describeDesktopUpdateRolloutTransition(
      { state: 'paused' },
      { state: 'active', percentage: 10 },
    ),
    { action: 'resume', fromControlName: 'paused', toControlName: 'p10' },
  );
});

test('rollout bucket matches electron-updater 6.8.9 final-32-bit cohort semantics', () => {
  for (const installationId of Object.values(installations)) {
    assert.equal(
      desktopUpdateRolloutBucket(installationId),
      electronUpdaterReferenceBucket(installationId),
    );
  }
});

test('the same persisted installation ID has a stable cohort across repeated checks', () => {
  const control = { state: 'active', percentage: 30 };
  const firstBucket = desktopUpdateRolloutBucket(installations.low);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal(desktopUpdateRolloutBucket(installations.low), firstBucket);
    assert.equal(isDesktopUpdateRolloutEligible(installations.low, control), true);
  }
});

test('rollout increases are monotonic, decrease is explicit, and pause admits nobody', () => {
  const sets = new Map();
  for (const percentage of DESKTOP_UPDATE_ROLLOUT_PERCENTAGES) {
    sets.set(
      percentage,
      Object.entries(installations)
        .filter(([, id]) =>
          isDesktopUpdateRolloutEligible(id, { state: 'active', percentage }))
        .map(([name]) => name),
    );
  }

  for (const [lower, higher] of [[10, 30], [30, 50], [50, 100]]) {
    assert.ok(sets.get(lower).every((name) => sets.get(higher).includes(name)));
  }

  assert.ok(sets.get(30).length >= sets.get(10).length);
  assert.equal(
    Object.values(installations).some((id) =>
      isDesktopUpdateRolloutEligible(id, { state: 'paused' })),
    false,
  );
});

test('invalid installation IDs fail closed instead of being assigned a random cohort', () => {
  assert.throws(
    () => desktopUpdateRolloutBucket('not-an-installation-id'),
    /invalid Desktop update rollout installation ID/u,
  );
});

test('rollout metadata projection uses native stagingPercentage without changing artifact identity', () => {
  const source = [
    'version: 1.2.3',
    'path: MemoFlow-Windows-1.2.3-Setup.exe',
    'sha512: canonical-checksum',
    '',
  ].join('\n');
  const projected = projectDesktopUpdateRolloutMetadata(source, {
    state: 'active',
    percentage: 30,
  });
  assert.match(projected, /^version: 1\.2\.3\nstagingPercentage: 30$/mu);
  assert.match(projected, /sha512: canonical-checksum/u);
  assert.throws(
    () => projectDesktopUpdateRolloutMetadata(projected, {
      state: 'active',
      percentage: 50,
    }),
    /canonical Desktop update metadata must not contain stagingPercentage/u,
  );
});

test('materializes immutable active and paused control metadata bound to one publication', async () => {
  const fixture = await createPublicationFixture();
  try {
    const activeRoot = path.join(fixture.root, 'active');
    const active = await materializeDesktopUpdateRollout({
      publicationReceiptPath: fixture.publicationReceiptPath,
      feedRoot: fixture.feedRoot,
      outputRoot: activeRoot,
      control: { state: 'active', percentage: 30 },
      previousControl: { state: 'active', percentage: 50 },
    });
    assert.equal(active.receipt.control.controlName, 'p30');
    assert.deepEqual(active.receipt.transition, {
      action: 'decrease',
      fromControlName: 'p50',
      toControlName: 'p30',
    });
    assert.equal(active.receipt.control.effectiveStagingPercentage, 30);
    assert.equal(active.receipt.lanes.length, 1);
    const activeMetadata = await readFile(
      path.join(activeRoot, ...active.receipt.lanes[0].controlMetadataRelativePath.split('/')),
      'utf8',
    );
    assert.match(activeMetadata, /^stagingPercentage: 30$/mu);

    const pausedRoot = path.join(fixture.root, 'paused');
    const paused = await materializeDesktopUpdateRollout({
      publicationReceiptPath: fixture.publicationReceiptPath,
      feedRoot: fixture.feedRoot,
      outputRoot: pausedRoot,
      control: { state: 'paused' },
      previousControl: { state: 'active', percentage: 30 },
    });
    assert.equal(paused.receipt.control.controlName, 'paused');
    assert.equal(paused.receipt.transition.action, 'pause');
    const pausedMetadata = await readFile(
      path.join(pausedRoot, ...paused.receipt.lanes[0].controlMetadataRelativePath.split('/')),
      'utf8',
    );
    assert.match(pausedMetadata, /^stagingPercentage: 0$/mu);

    assert.notEqual(
      active.receipt.lanes[0].controlMetadataRelativePath,
      paused.receipt.lanes[0].controlMetadataRelativePath,
    );
    assert.equal(await readFile(fixture.sourcePath, 'utf8'), fixture.source);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('rollout materialization is deterministic across output directories', async () => {
  const fixture = await createPublicationFixture();
  try {
    const first = await materializeDesktopUpdateRollout({
      publicationReceiptPath: fixture.publicationReceiptPath,
      feedRoot: fixture.feedRoot,
      outputRoot: path.join(fixture.root, 'first'),
      control: { state: 'active', percentage: 10 },
    });
    const second = await materializeDesktopUpdateRollout({
      publicationReceiptPath: fixture.publicationReceiptPath,
      feedRoot: fixture.feedRoot,
      outputRoot: path.join(fixture.root, 'second'),
      control: { state: 'active', percentage: 10 },
    });

    assert.deepEqual(second.receipt, first.receipt);
    assert.deepEqual(
      await readFile(first.receiptPath),
      await readFile(second.receiptPath),
    );
    const firstMetadata = await readFile(
      path.join(fixture.root, 'first', ...first.receipt.lanes[0].controlMetadataRelativePath.split('/')),
    );
    const secondMetadata = await readFile(
      path.join(fixture.root, 'second', ...second.receipt.lanes[0].controlMetadataRelativePath.split('/')),
    );
    assert.deepEqual(secondMetadata, firstMetadata);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('rollout control rejects forged publication pointer and unsafe lane paths', async () => {
  const pointerFixture = await createPublicationFixture();
  try {
    const receipt = JSON.parse(await readFile(pointerFixture.publicationReceiptPath, 'utf8'));
    receipt.pointer.targetPrefix = receipt.pointer.targetPrefix.replace('/stable', '/beta');
    await writeFile(pointerFixture.publicationReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await assert.rejects(
      materializeDesktopUpdateRollout({
        publicationReceiptPath: pointerFixture.publicationReceiptPath,
        feedRoot: pointerFixture.feedRoot,
        outputRoot: path.join(pointerFixture.root, 'control'),
        control: { state: 'active', percentage: 10 },
      }),
      /publication pointer identity drift/u,
    );
  } finally {
    await rm(pointerFixture.root, { recursive: true, force: true });
  }

  const laneFixture = await createPublicationFixture();
  try {
    const receipt = JSON.parse(await readFile(laneFixture.publicationReceiptPath, 'utf8'));
    receipt.lanes[0].targetRelativeDirectory = '../windows/x64';
    await writeFile(laneFixture.publicationReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await assert.rejects(
      materializeDesktopUpdateRollout({
        publicationReceiptPath: laneFixture.publicationReceiptPath,
        feedRoot: laneFixture.feedRoot,
        outputRoot: path.join(laneFixture.root, 'control'),
        control: { state: 'active', percentage: 10 },
      }),
      /unsafe Desktop update rollout target relative directory/u,
    );
  } finally {
    await rm(laneFixture.root, { recursive: true, force: true });
  }
});

test('release workflow prepares initial p10 rollout evidence only after immutable feed materialization', async () => {
  const workflow = await readFile('.github/workflows/release-assets.yml', 'utf8');
  const feedIndex = workflow.indexOf('materialize-desktop-update-feed.mjs');
  const rolloutIndex = workflow.indexOf('materialize-desktop-update-rollout.mjs');
  const rolloutEvidenceIndex = workflow.indexOf('name: desktop-update-rollout-evidence');
  const releaseUploadIndex = workflow.indexOf('Upload the manifest-owned asset set to the draft GitHub Release');

  assert.ok(feedIndex >= 0);
  assert.ok(rolloutIndex > feedIndex);
  assert.match(workflow, /desktop-update-rollout 10/u);
  assert.ok(rolloutEvidenceIndex > rolloutIndex);
  assert.ok(releaseUploadIndex > rolloutEvidenceIndex);
  assert.doesNotMatch(workflow, /desktop-update-rollout.*(?:publish|deploy|switch)/u);
});

test('rollout control rejects publication lane contract and source identity drift', async () => {
  const contractFixture = await createPublicationFixture();
  try {
    const receipt = JSON.parse(await readFile(contractFixture.publicationReceiptPath, 'utf8'));
    receipt.lanes[0].installationKind = 'direct-appimage';
    await writeFile(
      contractFixture.publicationReceiptPath,
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    await assert.rejects(
      materializeDesktopUpdateRollout({
        publicationReceiptPath: contractFixture.publicationReceiptPath,
        feedRoot: contractFixture.feedRoot,
        outputRoot: path.join(contractFixture.root, 'control'),
        control: { state: 'active', percentage: 10 },
      }),
      /publication lane contract drift/u,
    );
  } finally {
    await rm(contractFixture.root, { recursive: true, force: true });
  }

  const sourceFixture = await createPublicationFixture();
  try {
    const receipt = JSON.parse(await readFile(sourceFixture.publicationReceiptPath, 'utf8'));
    receipt.lanes[0].files[0].sourcePlatform = 'linux-x64';
    await writeFile(sourceFixture.publicationReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await assert.rejects(
      materializeDesktopUpdateRollout({
        publicationReceiptPath: sourceFixture.publicationReceiptPath,
        feedRoot: sourceFixture.feedRoot,
        outputRoot: path.join(sourceFixture.root, 'control'),
        control: { state: 'active', percentage: 10 },
      }),
      /publication source platform drift/u,
    );
  } finally {
    await rm(sourceFixture.root, { recursive: true, force: true });
  }
});

test('rollout control fails closed when immutable publication metadata identity drifts', async () => {
  const fixture = await createPublicationFixture();
  try {
    await writeFile(fixture.sourcePath, fixture.source.replace('sha512: fixture', 'sha512: drift'));
    await assert.rejects(
      materializeDesktopUpdateRollout({
        publicationReceiptPath: fixture.publicationReceiptPath,
        feedRoot: fixture.feedRoot,
        outputRoot: path.join(fixture.root, 'control'),
        control: { state: 'active', percentage: 10 },
      }),
      /Desktop update rollout source metadata identity mismatch/u,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
