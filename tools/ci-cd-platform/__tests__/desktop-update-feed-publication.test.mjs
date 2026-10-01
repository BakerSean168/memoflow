import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { materializeDesktopUpdateFeed } from '../release-tools/materialize-desktop-update-feed.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const gitSha = '0123456789abcdef0123456789abcdef01234567';

function metadata(primary, files = [primary]) {
  return [
    'version: 1.2.3',
    'files:',
    ...files.flatMap((name) => [`  - url: ${name}`, '    sha512: fixture']),
    `path: ${primary}`,
    'sha512: fixture',
    '',
  ].join('\n');
}

async function put(root, platform, name, body) {
  const dir = path.join(root, platform);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, name);
  await writeFile(file, body);
  return {
    name,
    platform,
    sha256: createHash('sha256').update(body).digest('hex'),
    size: Buffer.byteLength(body),
  };
}

async function createFixture({ windowsPrimary = 'MemoFlow-Windows-1.2.3-Setup.exe' } = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'memoflow-feed-publication-'));
  const artifactRoot = path.join(cwd, 'artifacts');
  const assets = [];
  const platformDefs = {
    'windows-x64': {
      os: 'windows',
      arch: 'x64',
      signingState: 'unsigned',
      executableKind: 'packaged-exe',
      metadata: 'latest.yml',
      primary: windowsPrimary,
      files: [windowsPrimary],
      extras: ['MemoFlow-Windows-1.2.3-Setup.exe', 'MemoFlow-Windows-1.2.3-Setup.exe.blockmap'],
    },
    'linux-x64': {
      os: 'linux',
      arch: 'x64',
      signingState: 'unsigned',
      executableKind: 'installed-deb',
      metadata: 'latest-linux.yml',
      primary: 'MemoFlow-Linux-1.2.3.AppImage',
      files: ['MemoFlow-Linux-1.2.3.AppImage'],
      extras: ['MemoFlow-Linux-1.2.3.AppImage'],
    },
    'macos-x64': {
      os: 'macos',
      arch: 'x64',
      signingState: 'unsigned-pilot',
      executableKind: 'packaged-app',
      metadata: 'latest-mac-x64.yml',
      primary: 'MemoFlow-macOS-x64-1.2.3.zip',
      files: ['MemoFlow-macOS-x64-1.2.3.zip'],
      extras: ['MemoFlow-macOS-x64-1.2.3.zip', 'MemoFlow-macOS-x64-1.2.3.zip.blockmap'],
    },
    'macos-arm64': {
      os: 'macos',
      arch: 'arm64',
      signingState: 'unsigned-pilot',
      executableKind: 'packaged-app',
      metadata: 'latest-mac-arm64.yml',
      primary: 'MemoFlow-macOS-arm64-1.2.3.zip',
      files: ['MemoFlow-macOS-arm64-1.2.3.zip'],
      extras: ['MemoFlow-macOS-arm64-1.2.3.zip', 'MemoFlow-macOS-arm64-1.2.3.zip.blockmap'],
    },
  };

  const platforms = {};
  for (const [platform, def] of Object.entries(platformDefs)) {
    const names = new Set(def.extras);
    if (!def.primary.includes('/') && !def.primary.includes('\\')) names.add(def.primary);
    for (const name of names) {
      assets.push(await put(artifactRoot, platform, name, `${platform}:${name}\n`));
    }
    const metadataBody = metadata(def.primary, def.files);
    assets.push(await put(artifactRoot, platform, def.metadata, metadataBody));
    platforms[platform] = {
      os: def.os,
      arch: def.arch,
      signingState: def.signingState,
      runtimeValidation: {
        status: 'passed',
        method: 'packaged-electron-playwright',
        executableKind: def.executableKind,
      },
      trustValidation: null,
      assets: [...names, def.metadata],
    };
  }

  const manifest = {
    schemaVersion: 2,
    kind: 'desktop-release',
    version: '1.2.3',
    tag: 'v1.2.3',
    gitSha,
    platforms,
    assets,
  };
  const manifestPath = path.join(cwd, 'desktop-release-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { cwd, artifactRoot, manifestPath, manifest };
}

async function tree(root) {
  const entries = [];
  async function visit(dir, prefix = '') {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = path.posix.join(prefix, entry.name);
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(absolute, relative);
      else entries.push([relative, await readFile(absolute, 'utf8')]);
    }
  }
  await visit(root);
  return entries;
}

test('materializes only eligible lanes and preserves canonical artifact identity', async () => {
  const fixture = await createFixture();
  try {
    const outputRoot = path.join(fixture.cwd, 'feed');
    const { receipt } = await materializeDesktopUpdateFeed({
      manifestPath: fixture.manifestPath,
      artifactRoot: fixture.artifactRoot,
      outputRoot,
    });

    assert.deepEqual(receipt.lanes.map((lane) => `${lane.platform}/${lane.arch}`), ['windows/x64']);
    assert.deepEqual(receipt.skippedLanes.map((lane) => ({
      coordinate: `${lane.platform}/${lane.arch}`,
      reason: lane.reason,
    })), [
      { coordinate: 'darwin/arm64', reason: 'Desktop update feed signing state is ineligible' },
      { coordinate: 'darwin/x64', reason: 'Desktop update feed signing state is ineligible' },
      { coordinate: 'linux/x64', reason: 'Desktop update feed runtime evidence is ineligible' },
    ]);
    assert.match(receipt.versionedPrefix, /^versions\/v1\.2\.3\//u);
    const lane = receipt.lanes[0];
    assert.ok(lane.files.some((file) => file.role === 'blockmap'));
    assert.ok(
      lane.files.every((file) => {
        const canonical = fixture.manifest.assets.find(
          (asset) => asset.platform === file.sourcePlatform && asset.name === file.sourceAsset,
        );
        return canonical?.sha256 === file.sha256 && canonical?.size === file.size;
      }),
    );
    await readFile(
      path.join(
        outputRoot,
        receipt.versionedPrefix,
        'stable/windows/x64/MemoFlow-Windows-1.2.3-Setup.exe.blockmap',
      ),
    );
  } finally {
    await rm(fixture.cwd, { recursive: true, force: true });
  }
});

test('feed materialization is deterministic across output directories', async () => {
  const fixture = await createFixture();
  try {
    const first = path.join(fixture.cwd, 'feed-a');
    const second = path.join(fixture.cwd, 'feed-b');
    await materializeDesktopUpdateFeed({ manifestPath: fixture.manifestPath, artifactRoot: fixture.artifactRoot, outputRoot: first });
    await materializeDesktopUpdateFeed({ manifestPath: fixture.manifestPath, artifactRoot: fixture.artifactRoot, outputRoot: second });
    assert.deepEqual(await tree(first), await tree(second));
  } finally {
    await rm(fixture.cwd, { recursive: true, force: true });
  }
});

test('rejects path traversal and ambiguous canonical artifact resolution', async () => {
  const traversal = await createFixture({ windowsPrimary: '../evil.exe' });
  try {
    await assert.rejects(
      materializeDesktopUpdateFeed({
        manifestPath: traversal.manifestPath,
        artifactRoot: traversal.artifactRoot,
        outputRoot: path.join(traversal.cwd, 'feed'),
      }),
      /unsafe Desktop update metadata reference/u,
    );
  } finally {
    await rm(traversal.cwd, { recursive: true, force: true });
  }

  const ambiguous = await createFixture();
  try {
    const duplicateDir = path.join(ambiguous.artifactRoot, 'windows-x64', 'duplicate');
    await mkdir(duplicateDir, { recursive: true });
    await writeFile(
      path.join(duplicateDir, 'MemoFlow-Windows-1.2.3-Setup.exe'),
      'duplicate bytes\n',
    );
    await assert.rejects(
      materializeDesktopUpdateFeed({
        manifestPath: ambiguous.manifestPath,
        artifactRoot: ambiguous.artifactRoot,
        outputRoot: path.join(ambiguous.cwd, 'feed'),
      }),
      /resolved 2 files; expected exactly one/u,
    );
  } finally {
    await rm(ambiguous.cwd, { recursive: true, force: true });
  }
});

test('release workflow materializes and retains feed evidence after metadata closure', async () => {
  const workflow = await readFile(path.join(repoRoot, '.github/workflows/release-assets.yml'), 'utf8');
  const verify = workflow.indexOf('verify-desktop-update-metadata.mjs desktop-release-manifest.json artifacts');
  const materialize = workflow.indexOf('materialize-desktop-update-feed.mjs');
  const retain = workflow.indexOf('desktop-update-feed-evidence');
  const releaseUpload = workflow.indexOf('gh release upload');

  assert.ok(verify >= 0);
  assert.ok(materialize > verify);
  assert.ok(retain > materialize);
  assert.ok(releaseUpload > materialize);
  assert.doesNotMatch(workflow, /publication_class|publicationClass|extraMetadata\.memoflowUpdate/u);
  assert.match(workflow, /desktop-release-manifest\.json artifacts desktop-update-feed stable/u);

});
