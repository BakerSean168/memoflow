import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRuntimeClosure } from '../create-runtime-closure.mjs';
import { restoreRuntimeClosure } from '../restore-runtime-closure.mjs';

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

test('runtime closure recursively includes workspace package dist and restores it', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'ci-cd-runtime-closure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJson(path.join(root, 'apps/api/package.json'), {
    name: '@memoflow/api',
    dependencies: { '@memoflow/alpha': 'workspace:*' },
  });
  await writeJson(path.join(root, 'packages/alpha/package.json'), {
    name: '@memoflow/alpha',
    dependencies: { '@memoflow/beta': 'workspace:*' },
  });
  await writeJson(path.join(root, 'packages/beta/package.json'), { name: '@memoflow/beta' });
  await writeJson(path.join(root, 'scope/delivery-manifest-v1.json'), {
    commit: 'sha',
    digest: 'a'.repeat(64),
  });
  await mkdir(path.join(root, 'packages/alpha/dist'), { recursive: true });
  await mkdir(path.join(root, 'packages/beta/dist'), { recursive: true });
  await writeFile(path.join(root, 'packages/alpha/dist/index.js'), 'alpha');
  await writeFile(path.join(root, 'packages/beta/dist/index.js'), 'beta');

  const artifact = await createRuntimeClosure({
    workspaceRoot: root,
    deliveryManifest: 'scope/delivery-manifest-v1.json',
    manifestOutput: 'reports/closure.json',
  });
  assert.deepEqual(
    artifact.entries.map(({ name }) => name),
    ['@memoflow/alpha', '@memoflow/beta'],
  );
  assert.equal(
    JSON.parse(await readFile(path.join(root, 'reports/closure.json'), 'utf8')).entries.length,
    2,
  );

  await rm(path.join(root, 'packages/alpha/dist'), { recursive: true, force: true });
  await rm(path.join(root, 'packages/beta/dist'), { recursive: true, force: true });
  const restored = await restoreRuntimeClosure({
    manifestFile: path.join(root, 'reports/closure.json'),
    sourceArg: path.join(root, 'api-runtime-closure'),
    workspaceArg: root,
  });
  assert.equal(restored, 2);
  assert.equal(await readFile(path.join(root, 'packages/beta/dist/index.js'), 'utf8'), 'beta');

  const tamperedManifest = JSON.parse(
    await readFile(path.join(root, 'reports/closure.json'), 'utf8'),
  );
  tamperedManifest.entries = tamperedManifest.entries.slice(0, 1);
  await writeJson(path.join(root, 'reports/tampered-closure.json'), tamperedManifest);
  await assert.rejects(
    () =>
      restoreRuntimeClosure({
        manifestFile: path.join(root, 'reports/tampered-closure.json'),
        sourceArg: path.join(root, 'api-runtime-closure'),
        workspaceArg: root,
      }),
    /do not match staged directories/,
  );
});

test('runtime closure rejects a missing transitive package build', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'ci-cd-runtime-closure-missing-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJson(path.join(root, 'apps/api/package.json'), {
    name: '@memoflow/api',
    dependencies: { '@memoflow/alpha': 'workspace:*' },
  });
  await writeJson(path.join(root, 'packages/alpha/package.json'), { name: '@memoflow/alpha' });
  await writeJson(path.join(root, 'scope/delivery-manifest-v1.json'), {
    commit: 'sha',
    digest: 'a'.repeat(64),
  });
  await assert.rejects(
    () =>
      createRuntimeClosure({
        workspaceRoot: root,
        deliveryManifest: 'scope/delivery-manifest-v1.json',
        manifestOutput: 'reports/closure.json',
      }),
    /Missing built dist/,
  );
});
