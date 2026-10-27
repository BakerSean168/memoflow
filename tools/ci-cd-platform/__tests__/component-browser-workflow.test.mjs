import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('Component Browser executes source contracts without a product or workspace build', async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  const job = workflow.split('\n  component-browser:')[1].split('\n  contract:')[0];
  assert.match(job, /needs: scope-detector/u);
  assert.match(job, /job_component_browser == 'true'/u);
  assert.match(job, /run-ci-tasks.mjs component-browser/u);
  assert.doesNotMatch(job, /nx run-many.*(?:-t|--target[s]?)\s+build/u);
  assert.doesNotMatch(job, /needs:.*\bbuild\b/u);
});

test('Web and Desktop visual harnesses resolve IPC and shared domain dependencies from source', async () => {
  const { resolveConfig } = await import('vite');
  for (const mode of ['production', 'desktop']) {
    const config = await resolveConfig(
      { configFile: path.resolve('apps/web/e2e/visual-regression/vite.config.ts'), mode },
      'build',
    );
    for (const [specifier, source] of [
      ['@memoflow/ipc-client', 'packages/ipc-client/src/index.ts'],
      ['@memoflow/utils/domain', 'packages/domain-shared/src/index.ts'],
      ['@memoflow/utils/domain', 'packages/domain-shared/src/shared/index.ts'],
    ]) {
      const resolved = await config.createResolver()(
        specifier,
        path.resolve('packages/app-vue/src/shared/keyboard/device-keymap.ts'),
      );
      assert.equal(resolved, path.resolve(source), `${mode}: ${specifier}`);
    }
  }
});

test('Provider acceptance is Nightly-only with Postgres, a full lane input and self-building API', async () => {
  const { default: YAML } = await import('yaml');
  const ci = YAML.parse(await readFile('.github/workflows/ci.yml', 'utf8'));
  assert.equal(ci.jobs['web-specialized'], undefined);
  assert.equal(ci.jobs['build-backend'], undefined);
  assert.doesNotMatch(JSON.stringify(ci), /ci-build-artifacts-backend|web:e2e:ai-provider/u);
  const nightly = YAML.parse(await readFile('.github/workflows/nightly-audit.yml', 'utf8'));
  const audit = nightly.jobs.audit;
  assert.ok(audit.services.postgres);
  assert.match(audit.env.DATABASE_URL, /5433\/memoflow_test/u);
  assert.equal(audit.env.E2E_PREBUILT_ARTIFACT, undefined);
  const bind = audit.steps.findIndex(
    (s) => s.name === 'Bind standalone audit commands to a full Web lane input',
  );
  const provider = audit.steps.findIndex((s) => s.run?.includes('nx run web:e2e:ai-provider'));
  assert.ok(bind > 0 && provider > bind);
  assert.match(audit.steps[bind].run, /create-lane-input.mjs --lane web/u);
  assert.match(audit.steps[bind].run, /DELIVERY_MANIFEST_PATH=.*GITHUB_ENV/u);
  assert.match(audit.steps[bind].run, /LANE_INPUT_PATH=.*GITHUB_ENV/u);
  assert.equal(audit.steps[provider].env.E2E_PREBUILT_ARTIFACT, undefined);
  const entry = await readFile('apps/web/e2e/helpers/start-api-server.ts', 'utf8');
  assert.match(entry, /buildApiApp\(workspaceRoot\)/u);
  const ownership = JSON.parse(await readFile('tools/test-system-v2/e2e-ownership.json', 'utf8'));
  assert.equal(ownership.collectors['apps/web/playwright.config.ts'].lane, 'nightly');
});

test('API helper actually invokes Nx api:build when Nightly has no prebuilt artifact', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process');
  const root = await mkdtemp(path.join(tmpdir(), 'nightly-api-build-'));
  try {
    await mkdir(path.join(root, 'node_modules/nx/dist/bin'), { recursive: true });
    await writeFile(
      path.join(root, 'node_modules/nx/dist/bin/nx.js'),
      `require('node:fs').writeFileSync('build-command.json', JSON.stringify(process.argv.slice(2)));`,
    );
    const invoke = (env = {}) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          '--input-type=module',
          '-e',
          `import { buildApiApp } from ${JSON.stringify(path.resolve('apps/web/e2e/helpers/build-api.ts'))};buildApiApp(${JSON.stringify(root)});`,
        ],
        { encoding: 'utf8', env: { ...process.env, E2E_PREBUILT_ARTIFACT: '', ...env } },
      );
    const result = invoke();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(JSON.parse(await readFile(path.join(root, 'build-command.json'))), [
      'run',
      'api:build',
    ]);
    await rm(path.join(root, 'build-command.json'));
    await mkdir(path.join(root, 'apps/api/dist'), { recursive: true });
    await writeFile(path.join(root, 'apps/api/dist/main.js'), '');
    assert.equal(invoke({ E2E_PREBUILT_ARTIFACT: '1' }).status, 0);
    await assert.rejects(readFile(path.join(root, 'build-command.json')), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
