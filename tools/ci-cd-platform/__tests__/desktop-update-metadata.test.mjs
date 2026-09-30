import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  DESKTOP_UPDATE_METADATA_BASELINE,
  parseElectronBuilderUpdateMetadata,
  verifyDesktopUpdateMetadataClosure,
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
