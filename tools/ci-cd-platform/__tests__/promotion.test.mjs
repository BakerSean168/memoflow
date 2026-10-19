import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { buildPromotionManifest } from '../promote-artifact.mjs';

const execFileAsync = promisify(execFile);

function artifact(name, artifactDigest = 'a'.repeat(64)) {
  const manifest = {
    kind: 'artifact-manifest-v1',
    version: 1,
    name,
    commit: 'sha',
    digest: artifactDigest,
    sourceManifestDigest: 'a'.repeat(64),
    path: `dist/${name}`,
    createdBy: 'test',
    toolchain: { node: 'test' },
    provenance: { workflow: 'test', runId: null, ref: null },
  };
  if (name === 'api-runtime-closure') {
    manifest.entries = [{ name: '@memoflow/test', path: 'packages/test/dist' }];
  }
  return manifest;
}

test('promotes only artifacts from the same commit', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ci-cd-promotion-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'promotion.json');
  const artifacts = [artifact('api'), artifact('web', 'b'.repeat(64))];
  const promotion = await buildPromotionManifest({
    artifactManifests: artifacts,
    commit: 'sha',
    environment: 'preview',
    promotedBy: 'test',
    output,
    sourceManifestDigest: 'a'.repeat(64),
  });
  assert.equal(promotion.kind, 'promotion-manifest-v1');
  assert.equal(JSON.parse(await readFile(output, 'utf8')).artifacts.length, 2);
  await assert.rejects(
    () =>
      buildPromotionManifest({
        artifactManifests: [{ ...artifacts[0], commit: 'other' }],
        commit: 'sha',
        environment: 'preview',
        promotedBy: 'test',
        output,
      }),
    /does not match/,
  );
  await assert.rejects(
    () =>
      buildPromotionManifest({
        artifactManifests: artifacts,
        commit: 'sha',
        environment: 'preview',
        promotedBy: 'test',
        output,
        sourceManifestDigest: 'c'.repeat(64),
      }),
    /do not match the verified delivery manifest/,
  );
});

test('production promotion fails closed unless the complete artifact closure is present', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ci-cd-production-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'promotion.json');
  const complete = [
    'api',
    'api-runtime-closure',
    'web',
    'migrator',
    'database',
    'database-runtime',
  ].map((name) => artifact(name));
  const promotion = await buildPromotionManifest({
    artifactManifests: complete,
    commit: 'sha',
    environment: 'production',
    promotedBy: 'test',
    output,
  });
  assert.deepEqual(
    promotion.artifacts.map(({ name }) => name),
    ['api', 'api-runtime-closure', 'database', 'database-runtime', 'migrator', 'web'],
  );
  await assert.rejects(
    () =>
      buildPromotionManifest({
        artifactManifests: complete.filter(({ name }) => name !== 'database'),
        commit: 'sha',
        environment: 'production',
        promotedBy: 'test',
        output,
      }),
    /missing required promotion artifacts: database/,
  );
});

test('promotion CLI reads manifests and writes a validated production receipt', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ci-cd-promotion-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'promotion.json');
  const sourceManifestDigest = 'a'.repeat(64);
  const manifests = [
    'api',
    'api-runtime-closure',
    'web',
    'migrator',
    'database',
    'database-runtime',
  ].map((name) => artifact(name));

  await Promise.all(
    manifests.map((manifest) =>
      writeFile(
        path.join(directory, `${manifest.name}-artifact-manifest.json`),
        `${JSON.stringify(manifest)}\n`,
      ),
    ),
  );
  await execFileAsync(
    process.execPath,
    [
      path.resolve(new URL('../promote-artifact.mjs', import.meta.url).pathname),
      directory,
      'sha',
      'production',
      output,
    ],
    { env: { ...process.env, DELIVERY_MANIFEST_DIGEST: sourceManifestDigest } },
  );

  const promotion = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(promotion.environment, 'production');
  assert.equal(promotion.artifacts.length, 6);
});
