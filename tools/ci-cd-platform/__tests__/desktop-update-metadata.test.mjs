import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
// DU-1401 intentionally shares this dependency-free Desktop-owned projection with release tooling.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  DESKTOP_UPDATE_FEED_CONTRACT,
  resolveDesktopUpdateFeedProjection,
  validateDesktopUpdateFeedContract,
} from '../../../apps/desktop/desktop-update-feed-projection.mjs';
import { createMacosTrustReceipt } from '../release-tools/verify-macos-trust.mjs';
import { validateDesktopUpdateFeedEligibility } from '../release-tools/validate-desktop-update-feed-eligibility.mjs';
import {
  DESKTOP_UPDATE_METADATA_BASELINE,
  parseElectronBuilderUpdateMetadata,
  verifyDesktopUpdateMetadataClosure,
  verifyDesktopUpdateReleaseConfiguration,
} from '../release-tools/verify-desktop-update-metadata.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function updateMetadata({ version = '1.2.3', primary, files = [primary] }) {
  return [
    `version: ${version}`,
    'files:',
    ...files.flatMap((name) => [`  - url: ${name}`, '    sha512: fixture-sha512', '    size: 123']),
    `path: ${primary}`,
    'sha512: fixture-sha512',
    "releaseDate: '2026-09-30T00:00:00.000Z'",
    '',
  ].join('\n');
}

async function createFixture() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'memoflow-desktop-update-metadata-'));
  const artifactRoot = path.join(cwd, 'artifacts');
  await mkdir(artifactRoot, { recursive: true });

  const platformFixtures = {
    'windows-x64': {
      metadata: DESKTOP_UPDATE_METADATA_BASELINE['windows-x64'].metadata,
      primary: 'MemoFlow-Windows-1.2.3-Setup.exe',
      files: ['MemoFlow-Windows-1.2.3-Setup.exe'],
      assets: ['MemoFlow-Windows-1.2.3-Setup.exe', 'MemoFlow-Windows-1.2.3-Setup.exe.blockmap'],
    },
    'linux-x64': {
      metadata: DESKTOP_UPDATE_METADATA_BASELINE['linux-x64'].metadata,
      primary: 'MemoFlow-Linux-1.2.3.AppImage',
      files: [
        'MemoFlow-Linux-1.2.3.AppImage',
        'MemoFlow-Linux-1.2.3.deb',
        'MemoFlow-Linux-1.2.3.rpm',
      ],
      assets: [
        'MemoFlow-Linux-1.2.3.AppImage',
        'MemoFlow-Linux-1.2.3.deb',
        'MemoFlow-Linux-1.2.3.rpm',
      ],
    },
    'macos-x64': {
      metadata: DESKTOP_UPDATE_METADATA_BASELINE['macos-x64'].metadata,
      primary: 'MemoFlow-macOS-x64-1.2.3.zip',
      files: ['MemoFlow-macOS-x64-1.2.3.zip', 'MemoFlow-macOS-x64-1.2.3.dmg'],
      assets: [
        'MemoFlow-macOS-x64-1.2.3.zip',
        'MemoFlow-macOS-x64-1.2.3.zip.blockmap',
        'MemoFlow-macOS-x64-1.2.3.dmg',
        'MemoFlow-macOS-x64-1.2.3.dmg.blockmap',
      ],
    },
    'macos-arm64': {
      metadata: DESKTOP_UPDATE_METADATA_BASELINE['macos-arm64'].metadata,
      primary: 'MemoFlow-macOS-arm64-1.2.3.zip',
      files: ['MemoFlow-macOS-arm64-1.2.3.zip', 'MemoFlow-macOS-arm64-1.2.3.dmg'],
      assets: [
        'MemoFlow-macOS-arm64-1.2.3.zip',
        'MemoFlow-macOS-arm64-1.2.3.zip.blockmap',
        'MemoFlow-macOS-arm64-1.2.3.dmg',
        'MemoFlow-macOS-arm64-1.2.3.dmg.blockmap',
      ],
    },
  };

  const assets = [];
  const platforms = {};

  for (const [platform, fixture] of Object.entries(platformFixtures)) {
    const directory = path.join(artifactRoot, `desktop-${platform}`);
    await mkdir(directory, { recursive: true });

    for (const name of fixture.assets) {
      await writeFile(path.join(directory, name), `${platform}:${name}\n`);
      assets.push({ name, platform });
    }

    await writeFile(
      path.join(directory, fixture.metadata),
      updateMetadata({ primary: fixture.primary, files: fixture.files }),
    );
    assets.push({ name: fixture.metadata, platform });

    platforms[platform] = {
      assets: [...fixture.assets, fixture.metadata],
    };
  }

  const manifestPath = path.join(cwd, 'desktop-release-manifest.json');
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        kind: 'desktop-release',
        schemaVersion: 2,
        version: '1.2.3',
        platforms,
        assets,
      },
      null,
      2,
    )}\n`,
  );

  return { cwd, artifactRoot, manifestPath, platformFixtures };
}

test('parses the electron-builder update metadata fields owned by the release gate', () => {
  const parsed = parseElectronBuilderUpdateMetadata(
    updateMetadata({
      primary: 'MemoFlow-Windows-1.2.3-Setup.exe',
      files: ['MemoFlow-Windows-1.2.3-Setup.exe'],
    }),
  );

  assert.equal(parsed.version, '1.2.3');
  assert.equal(parsed.primaryPath, 'MemoFlow-Windows-1.2.3-Setup.exe');
  assert.deepEqual(parsed.references, ['MemoFlow-Windows-1.2.3-Setup.exe']);
});

test('runtime feed declaration stays aligned with electron-builder release identity', async () => {
  const configuration = await verifyDesktopUpdateReleaseConfiguration();

  assert.deepEqual(configuration, {
    provider: 'github',
    owner: 'BakerSean168',
    repo: 'memoflow',
    tagNamePrefix: 'v',
    releaseType: 'release',
    stableChannel: 'latest',
    windows: {
      appId: 'com.memoflow.app',
      productName: 'MemoFlow',
      artifactName: '${productName}-Windows-${version}-Setup.${ext}',
      metadata: 'latest.yml',
    },
  });
});

test('desktop update metadata closes over the canonical platform release assets', async () => {
  const fixture = await createFixture();
  try {
    const verified = await verifyDesktopUpdateMetadataClosure(fixture);
    assert.deepEqual(
      verified.map(({ platform, metadata }) => ({ platform, metadata })),
      [
        { platform: 'windows-x64', metadata: 'latest.yml' },
        { platform: 'linux-x64', metadata: 'latest-linux.yml' },
        { platform: 'macos-x64', metadata: 'latest-mac-x64.yml' },
        { platform: 'macos-arm64', metadata: 'latest-mac-arm64.yml' },
      ],
    );
  } finally {
    await rm(fixture.cwd, { recursive: true, force: true });
  }
});

test('desktop update metadata fails closed when it references an artifact outside its platform release set', async () => {
  const fixture = await createFixture();
  try {
    const windows = fixture.platformFixtures['windows-x64'];
    const metadataPath = path.join(fixture.artifactRoot, 'desktop-windows-x64', windows.metadata);
    await writeFile(
      metadataPath,
      updateMetadata({
        primary: windows.primary,
        files: [windows.primary, 'MemoFlow-Windows-1.2.3-Missing.exe'],
      }),
    );

    await assert.rejects(
      () => verifyDesktopUpdateMetadataClosure(fixture),
      /references missing windows-x64 release asset: MemoFlow-Windows-1\.2\.3-Missing\.exe/u,
    );
  } finally {
    await rm(fixture.cwd, { recursive: true, force: true });
  }
});

test('desktop update metadata fails closed when the Windows NSIS installer identity drifts', async () => {
  const fixture = await createFixture();
  try {
    const driftedInstaller = 'MemoFlow-Windows-1.2.3-Alternate.exe';
    const windowsDirectory = path.join(fixture.artifactRoot, 'desktop-windows-x64');
    await writeFile(path.join(windowsDirectory, driftedInstaller), 'drifted installer\n');

    const windows = fixture.platformFixtures['windows-x64'];
    await writeFile(
      path.join(windowsDirectory, windows.metadata),
      updateMetadata({ primary: driftedInstaller, files: [driftedInstaller] }),
    );

    const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8'));
    manifest.assets.push({ name: driftedInstaller, platform: 'windows-x64' });
    manifest.platforms['windows-x64'].assets.push(driftedInstaller);
    await writeFile(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      () => verifyDesktopUpdateMetadataClosure(fixture),
      /Desktop update Windows installer identity drift: MemoFlow-Windows-1\.2\.3-Alternate\.exe != MemoFlow-Windows-1\.2\.3-Setup\.exe/u,
    );
  } finally {
    await rm(fixture.cwd, { recursive: true, force: true });
  }
});

test('desktop update metadata fails closed when the current macOS arch manifest is missing', async () => {
  const fixture = await createFixture();
  try {
    const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8'));
    manifest.assets = manifest.assets.filter(
      (asset) => asset.name !== DESKTOP_UPDATE_METADATA_BASELINE['macos-arm64'].metadata,
    );
    await writeFile(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      () => verifyDesktopUpdateMetadataClosure(fixture),
      /missing Desktop update metadata for macos-arm64: latest-mac-arm64\.yml/u,
    );
  } finally {
    await rm(fixture.cwd, { recursive: true, force: true });
  }
});

test('desktop update metadata fails closed on release version drift', async () => {
  const fixture = await createFixture();
  try {
    const linux = fixture.platformFixtures['linux-x64'];
    const metadataPath = path.join(fixture.artifactRoot, 'desktop-linux-x64', linux.metadata);
    await writeFile(
      metadataPath,
      updateMetadata({ version: '1.2.2', primary: linux.primary, files: linux.files }),
    );

    await assert.rejects(
      () => verifyDesktopUpdateMetadataClosure(fixture),
      /Desktop update metadata version mismatch for linux-x64: 1\.2\.2 != 1\.2\.3/u,
    );
  } finally {
    await rm(fixture.cwd, { recursive: true, force: true });
  }
});

test('release workflow verifies update metadata closure before uploading Desktop assets', async () => {
  const workflow = await readFile(
    path.join(repoRoot, '.github/workflows/release-assets.yml'),
    'utf8',
  );
  const createIndex = workflow.indexOf('create-desktop-manifest.mjs artifacts');
  const verifyIndex = workflow.indexOf(
    'verify-desktop-update-metadata.mjs desktop-release-manifest.json artifacts',
  );
  const uploadIndex = workflow.indexOf('gh release upload');

  assert.ok(createIndex >= 0, 'workflow must create desktop-release-manifest.json');
  assert.ok(
    verifyIndex > createIndex,
    'update metadata verification must run after manifest creation',
  );
  assert.ok(
    uploadIndex > verifyIndex,
    'update metadata verification must run before release upload',
  );
});

function macosTrustReceipt(platform, arch) {
  return createMacosTrustReceipt({
    platform,
    arch,
    appBundle: `MemoFlow-${arch}.app`,
    dmg: `MemoFlow-${arch}.dmg`,
    observation: {
      appAuthority: 'Developer ID Application: MemoFlow Test (ABCDEFGHIJ)',
      dmgAuthority: 'Developer ID Application: MemoFlow Test (ABCDEFGHIJ)',
      teamIdentifier: 'ABCDEFGHIJ',
      expectedArchitecture: arch === 'x64' ? 'x86_64' : 'arm64',
    },
  });
}

function feedEligibilityManifest({
  projection,
  signingState,
  executableKind,
  trustValidation = null,
}) {
  return {
    schemaVersion: 2,
    kind: 'desktop-release',
    version: '1.2.3',
    platforms: {
      [projection.sourceReleasePlatform]: {
        os: projection.platform === 'darwin' ? 'macos' : projection.platform,
        arch: projection.arch,
        signingState,
        runtimeValidation: {
          status: 'passed',
          method: 'packaged-electron-playwright',
          executableKind,
        },
        trustValidation,
        assets: [projection.sourceMetadataAsset],
      },
    },
    assets: [
      {
        platform: projection.sourceReleasePlatform,
        name: projection.sourceMetadataAsset,
      },
    ],
  };
}

test('desktop update feed projection resolves canonical lanes and channel substitutions', () => {
  validateDesktopUpdateFeedContract(DESKTOP_UPDATE_FEED_CONTRACT);

  const expectations = [
    {
      coordinates: {
        platform: 'windows',
        arch: 'x64',
        installationKind: 'direct-nsis',
      },
      sourceReleasePlatform: 'windows-x64',
      sourceMetadataAsset: 'latest.yml',
      targetMetadata: 'latest.yml',
    },
    {
      coordinates: {
        platform: 'darwin',
        arch: 'x64',
        installationKind: 'direct-signed-macos',
      },
      sourceReleasePlatform: 'macos-x64',
      sourceMetadataAsset: 'latest-mac-x64.yml',
      targetMetadata: 'latest-mac.yml',
    },
    {
      coordinates: {
        platform: 'darwin',
        arch: 'arm64',
        installationKind: 'direct-signed-macos',
      },
      sourceReleasePlatform: 'macos-arm64',
      sourceMetadataAsset: 'latest-mac-arm64.yml',
      targetMetadata: 'latest-mac.yml',
    },
    {
      coordinates: {
        platform: 'linux',
        arch: 'x64',
        installationKind: 'direct-appimage',
      },
      sourceReleasePlatform: 'linux-x64',
      sourceMetadataAsset: 'latest-linux.yml',
      targetMetadata: 'latest-linux.yml',
    },
  ];

  for (const channel of ['stable', 'beta', 'canary']) {
    for (const expectation of expectations) {
      const projection = resolveDesktopUpdateFeedProjection({
        channel,
        ...expectation.coordinates,
      });
      assert.ok(projection);
      assert.equal(projection.sourceReleasePlatform, expectation.sourceReleasePlatform);
      assert.equal(projection.sourceMetadataAsset, expectation.sourceMetadataAsset);
      assert.equal(projection.targetMetadata, expectation.targetMetadata);
      assert.equal(
        projection.targetRelativePath,
        `${channel}/${expectation.coordinates.platform}/${expectation.coordinates.arch}/${expectation.targetMetadata}`,
      );
    }
  }
});

test('desktop update feed projection rejects unsupported and non-self-managed coordinates', () => {
  const rejected = [
    { channel: 'stable', platform: 'windows', arch: 'arm64', installationKind: 'direct-nsis' },
    { channel: 'stable', platform: 'windows', arch: 'x64', installationKind: 'portable' },
    { channel: 'stable', platform: 'linux', arch: 'x64', installationKind: 'package-manager' },
    { channel: 'stable', platform: 'darwin', arch: 'x64', installationKind: 'system-store' },
    { channel: 'enterprise', platform: 'windows', arch: 'x64', installationKind: 'direct-nsis' },
  ];

  for (const coordinates of rejected) {
    assert.equal(resolveDesktopUpdateFeedProjection(coordinates), null);
  }
});

test('desktop update feed contract fixtures fail closed on ambiguity or policy drift', () => {
  const duplicateTarget = structuredClone(DESKTOP_UPDATE_FEED_CONTRACT);
  duplicateTarget.lanes[1] = {
    ...duplicateTarget.lanes[1],
    platform: duplicateTarget.lanes[0].platform,
    arch: duplicateTarget.lanes[0].arch,
    targetMetadata: duplicateTarget.lanes[0].targetMetadata,
  };
  assert.throws(
    () => validateDesktopUpdateFeedContract(duplicateTarget),
    /duplicate Desktop update feed target/u,
  );

  const driftedPolicy = structuredClone(DESKTOP_UPDATE_FEED_CONTRACT);
  driftedPolicy.lanes[2].eligibleSigningStates = ['unsigned-pilot'];
  assert.throws(
    () => validateDesktopUpdateFeedContract(driftedPolicy),
    /invalid Desktop update feed lane/u,
  );
});

test('desktop update feed eligibility accepts canonical Windows direct NSIS evidence', () => {
  const coordinates = {
    channel: 'stable',
    platform: 'windows',
    arch: 'x64',
    installationKind: 'direct-nsis',
  };
  const projection = resolveDesktopUpdateFeedProjection(coordinates);
  assert.ok(projection);
  const manifest = feedEligibilityManifest({
    projection,
    signingState: 'unsigned',
    executableKind: 'packaged-exe',
  });

  assert.equal(
    validateDesktopUpdateFeedEligibility({ coordinates, manifest }).targetRelativePath,
    'stable/windows/x64/latest.yml',
  );
});

test('desktop update feed eligibility requires signed-notarized macOS trust evidence', () => {
  const coordinates = {
    channel: 'stable',
    platform: 'darwin',
    arch: 'arm64',
    installationKind: 'direct-signed-macos',
  };
  const projection = resolveDesktopUpdateFeedProjection(coordinates);
  assert.ok(projection);

  const unsignedManifest = feedEligibilityManifest({
    projection,
    signingState: 'unsigned-pilot',
    executableKind: 'packaged-app',
  });
  assert.throws(
    () => validateDesktopUpdateFeedEligibility({ coordinates, manifest: unsignedManifest }),
    /signing state is ineligible/u,
  );

  const signedWithoutTrustManifest = feedEligibilityManifest({
    projection,
    signingState: 'signed-notarized',
    executableKind: 'packaged-app',
  });
  assert.throws(
    () =>
      validateDesktopUpdateFeedEligibility({
        coordinates,
        manifest: signedWithoutTrustManifest,
      }),
    /invalid macOS trust receipt identity/u,
  );

  const signedManifest = feedEligibilityManifest({
    projection,
    signingState: 'signed-notarized',
    executableKind: 'packaged-app',
    trustValidation: macosTrustReceipt('macos-arm64', 'arm64'),
  });
  assert.equal(
    validateDesktopUpdateFeedEligibility({ coordinates, manifest: signedManifest })
      .targetRelativePath,
    'stable/darwin/arm64/latest-mac.yml',
  );
});

test('desktop update feed eligibility does not treat installed-deb proof as AppImage proof', () => {
  const coordinates = {
    channel: 'stable',
    platform: 'linux',
    arch: 'x64',
    installationKind: 'direct-appimage',
  };
  const projection = resolveDesktopUpdateFeedProjection(coordinates);
  assert.ok(projection);
  const manifest = feedEligibilityManifest({
    projection,
    signingState: 'unsigned',
    executableKind: 'installed-deb',
  });

  assert.throws(
    () => validateDesktopUpdateFeedEligibility({ coordinates, manifest }),
    /runtime evidence is ineligible/u,
  );
});

test('Linux additive runtime proofs select AppImage and reject malformed evidence before fallback', () => {
  const coordinates = {
    channel: 'stable',
    platform: 'linux',
    arch: 'x64',
    installationKind: 'direct-appimage',
  };
  const projection = resolveDesktopUpdateFeedProjection(coordinates);
  const manifest = feedEligibilityManifest({
    projection,
    signingState: 'unsigned',
    executableKind: 'installed-deb',
  });
  const evidence = manifest.platforms['linux-x64'];
  const deb = evidence.runtimeValidation;
  const appImage = { ...deb, executableKind: 'packaged-appimage' };
  evidence.runtimeValidations = [deb];
  assert.throws(
    () => validateDesktopUpdateFeedEligibility({ coordinates, manifest }),
    /runtime evidence is ineligible/u,
  );
  evidence.runtimeValidations = [deb, appImage];
  assert.deepEqual(validateDesktopUpdateFeedEligibility({ coordinates, manifest }), projection);
  for (const invalid of [
    null,
    {},
    [],
    [deb, deb],
    [deb, appImage, appImage],
    [{ ...appImage, status: 'failed' }],
    [{ ...appImage, method: 'unknown' }],
    [{ ...appImage, executableKind: 'installed-rpm' }],
    [{ ...appImage, executableKind: 'packaged-exe' }],
  ]) {
    evidence.runtimeValidations = invalid;
    evidence.runtimeValidation = appImage; // A valid legacy proof must not mask a bad array.
    assert.throws(
      () => validateDesktopUpdateFeedEligibility({ coordinates, manifest }),
      /runtime validation missing or failed/u,
    );
  }
});
