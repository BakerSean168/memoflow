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
      ['@memoflow/domain-shared', 'packages/domain-shared/src/index.ts'],
      ['@memoflow/domain-shared/shared', 'packages/domain-shared/src/shared/index.ts'],
    ]) {
      const resolved = await config.createResolver()(
        specifier,
        path.resolve('packages/app-vue/src/shared/keyboard/device-keymap.ts'),
      );
      assert.equal(resolved, path.resolve(source), `${mode}: ${specifier}`);
    }
  }
});
