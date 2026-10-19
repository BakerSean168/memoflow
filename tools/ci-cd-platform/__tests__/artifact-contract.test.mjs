import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createArtifactManifest } from '../create-artifact-manifest.mjs';

test('artifact digest is stable while the output manifest stays outside the artifact', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'ci-cd-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, 'dist');
  const output = path.join(root, 'manifests', 'api-artifact-manifest.json');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(target));
  await writeFile(path.join(target, 'main.js'), 'console.log("ok");\n');
  const first = await createArtifactManifest({
    name: 'api',
    target,
    commit: 'sha',
    sourceManifestDigest: 'a'.repeat(64),
    output,
  });
  const second = await createArtifactManifest({
    name: 'api',
    target,
    commit: 'sha',
    sourceManifestDigest: 'a'.repeat(64),
    output,
  });
  assert.equal(first.digest, second.digest);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).digest, first.digest);
});
