import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { buildDeliveryManifest } from '../generate-delivery-manifest.mjs';
import { createNxShowProjectsInvocation } from '../lib/scope-detector.mjs';

const scope = {
  version: 1,
  base: 'base',
  head: 'head',
  full: false,
  projects: ['web'],
  unit: ['web'],
  coverage: [],
  smoke: [],
  integration: [],
  boundary: [],
  perf: [],
  webFlow: true,
  desktopFlow: false,
};

test('builds one deterministic delivery manifest from injected scope', async () => {
  const options = {
    base: 'base',
    head: 'head',
    event: 'pull_request',
    scope,
    files: ['apps/web/src/App.vue'],
  };
  const first = await buildDeliveryManifest(options);
  const second = await buildDeliveryManifest(options);
  assert.equal(first.digest, second.digest);
  assert.equal(first.kind, 'delivery-manifest-v1');
  assert.equal(first.risk.level, 'web-flow');
  assert.equal(first.lanes.web, true);
  assert.equal(first.lanes.integration, false);
});

test('uses the manifest lane policy for docs-only and root changes', async () => {
  const docsManifest = await buildDeliveryManifest({
    base: 'base',
    head: 'head',
    event: 'pull_request',
    scope: { ...scope, projects: [], unit: [], webFlow: false },
    files: ['docs/README.md'],
  });
  assert.equal(docsManifest.lanes.governance, true);
  assert.equal(docsManifest.lanes.validate, false);
  assert.equal(docsManifest.lanes.web, false);

  const rootManifest = await buildDeliveryManifest({
    base: 'base',
    head: 'head',
    event: 'pull_request',
    scope,
    files: ['nx.json'],
  });
  assert.equal(rootManifest.lanes.validate, true);
  assert.equal(rootManifest.lanes.boundary, true);
  assert.equal(rootManifest.lanes.integration, true);
  assert.equal(rootManifest.lanes.web, true);
  assert.equal(rootManifest.lanes.coverage, true);
  assert.equal(rootManifest.lanes.performance, true);
});

test('historical Desktop capability paths do not select Web Flow', async () => {
  const manifest = await buildDeliveryManifest({
    base: 'base',
    head: 'head',
    event: 'pull_request',
    scope: {
      ...scope,
      projects: ['desktop', 'repository'],
      unit: ['desktop', 'repository'],
      boundary: ['desktop'],
      integration: [],
      webFlow: true,
      desktopFlow: true,
    },
    files: [
      'apps/desktop/src/main/capabilities/capability-registry.ts',
      'apps/desktop/src/main/desktop-main-runtime.ts',
      'packages/repository/src/electron/local-vault-runtime.ts',
      'packages/repository/src/electron/local-vault-external-editor.spec.ts',
    ],
  });
  assert.equal(manifest.lanes.validate, true);
  assert.equal(manifest.lanes.web, false);
  assert.ok(manifest.risk.matchedLevels.includes('desktop'));
  assert.ok(!manifest.risk.matchedLevels.includes('web-flow'));
});

test('push to main is an exhaustive full audit regardless of changed path', async () => {
  const manifest = await buildDeliveryManifest({
    base: 'base',
    head: 'head',
    ref: 'refs/heads/main',
    event: 'push',
    scope: {
      ...scope,
      full: true,
      projects: ['desktop', 'web', 'api'],
      desktopFlow: true,
    },
    files: ['docs/README.md'],
  });
  assert.equal(manifest.full, true);
  assert.ok(Object.values(manifest.lanes).every(Boolean));
});

test('scope discovery invokes the installed Nx CLI directly instead of racing pnpm exec wrappers', () => {
  const root = path.resolve(import.meta.dirname, '../../..');
  const invocation = createNxShowProjectsInvocation(['--with-target=test:integration'], root);
  assert.equal(invocation.command, process.execPath);
  assert.match(invocation.args[0], /node_modules[\\/]nx[\\/]dist[\\/]bin[\\/]nx\.js$/u);
  assert.deepEqual(invocation.args.slice(1), [
    'show',
    'projects',
    '--with-target=test:integration',
    '--json',
  ]);
  assert.ok(!invocation.args.includes('pnpm'));
  assert.equal(invocation.bootstrap, path.join(root, 'tools/ci/node-process-bootstrap.cjs'));

  const stdout = execFileSync(invocation.command, invocation.args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${invocation.bootstrap}`.trim(),
    },
  });
  assert.ok(JSON.parse(stdout).includes('api'));
});
