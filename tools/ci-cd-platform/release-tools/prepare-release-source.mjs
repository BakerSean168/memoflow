import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import lifecycle from '../lib/release-lifecycle.cjs';

// Version overlays affect packaging only. The immutable Git source never changes.
export async function prepareReleaseSource({ root = process.cwd(), tag, channel, apply = false }) {
  const identity = lifecycle.releaseVersion(tag, channel);
  const rootPath = path.join(root, 'package.json');
  const desktopPath = path.join(root, 'apps/desktop/package.json');
  const [rootPackage, desktopPackage, manifest] = await Promise.all([
    readFile(rootPath, 'utf8').then(JSON.parse),
    readFile(desktopPath, 'utf8').then(JSON.parse),
    readFile(path.join(root, '.release-please-manifest.json'), 'utf8').then(JSON.parse),
  ]);
  assert(
    rootPackage.version === identity.sourceVersion &&
      desktopPackage.version === identity.sourceVersion &&
      manifest['.'] === identity.sourceVersion,
    'Release Please version drift',
  );
  if (channel === 'stable') {
    const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
    assert(
      changelog.includes('## [' + identity.sourceVersion + ']'),
      'Stable requires prepared Release Please notes',
    );
  }
  if (apply && channel === 'nightly') {
    for (const [file, contents] of [
      [rootPath, rootPackage],
      [desktopPath, desktopPackage],
    ]) {
      await writeFile(
        file,
        JSON.stringify({ ...contents, version: identity.packageVersion }, null, 2) + '\n',
      );
    }
  }
  return { ...identity, channel, tag, overlay: channel === 'nightly' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, channel, mode] = process.argv.slice(2);
  console.log(
    JSON.stringify(await prepareReleaseSource({ tag, channel, apply: mode === '--apply' })),
  );
}
