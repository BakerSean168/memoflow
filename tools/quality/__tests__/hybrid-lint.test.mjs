import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isResidual, listResidualFiles } from '../eslint-residual.mjs';
import { assertBoundaryPolicyMatches } from '../oxlint-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const oxlint = path.join(root, 'node_modules', '.bin', 'oxlint');
const eslint = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
const runOx = (file) => spawnSync(oxlint, ['--quiet', file], { cwd: root, encoding: 'utf8' });
const runEs = (file) =>
  spawnSync(process.execPath, [eslint, file], { cwd: root, encoding: 'utf8' });

async function probe(file, content, execute) {
  const destination = path.join(root, file);
  await writeFile(destination, content, { flag: 'wx' });
  try {
    return await execute(file);
  } finally {
    await rm(destination, { force: true });
  }
}

test('authoritative Nx boundary policy must match the Oxlint bridge exactly', async () => {
  const eslintConfig = (await import(pathToFileURL(path.join(root, 'eslint.config.ts')).href))
    .default;
  const oxlintConfig = JSON.parse(await readFile(path.join(root, '.oxlintrc.json'), 'utf8'));
  assert.ok(assertBoundaryPolicyMatches(oxlintConfig, eslintConfig) >= 31);
  const drift = structuredClone(oxlintConfig);
  drift.rules['@nx/enforce-module-boundaries'][1].depConstraints.pop();
  assert.throws(() => assertBoundaryPolicyMatches(drift, eslintConfig));
  drift.jsPlugins = [];
  assert.throws(() => assertBoundaryPolicyMatches(drift, eslintConfig));
});

test('residual selection retains Vue templates, Storybook, product time and JSON rule owners', () => {
  assert.equal(isResidual('packages/app-vue/src/modules/setting/components/AISettings.vue'), true);
  assert.equal(isResidual('packages/ai-ui/src/composables/useAIChatView.ts'), true);
  assert.equal(isResidual('packages/app-react/src/hooks/useTime.tsx'), true);
  assert.equal(isResidual('apps/storybook/src/MyCard.stories.ts'), true);
  assert.equal(isResidual('packages/patterns/tsconfig.json'), true);
  assert.equal(isResidual('packages/ai/src/server/application/provider.ts'), false);
  const paths = listResidualFiles(root);
  assert.ok(paths.length > 500);
  assert.ok(paths.some((p) => p.endsWith('.vue')));
  assert.ok(paths.some((p) => p.endsWith('.stories.ts')));
});

test('Oxlint must reject AI importing forbidden Task public package', async () => {
  await probe(
    'packages/ai/src/__quality_oxc_boundary_probe.ts',
    "import { value } from '@memoflow/task';\nexport const x = value;\n",
    (file) => {
      const result = runOx(file);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /enforce-module-boundaries|scope:ai/u);
    },
  );
});

test('Oxlint must reject production test-only imports while allowing the test seam', async () => {
  await probe(
    'packages/ai/src/__quality_oxc_import_probe.ts',
    "import { anIdentityId } from '@memoflow/test-utils/fixtures';\nexport const x = anIdentityId;\n",
    (file) => {
      const result = runOx(file);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /no-restricted-imports/u);
    },
  );
  const allowed = runOx('packages/time/src/engine/date-fns-engine.ts');
  assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
});

test('ESLint residual must reject Vue v-for without a key', async () => {
  await probe(
    'packages/ai-ui/src/__quality_oxc_vue_probe.vue',
    '<template><span v-for="item in items">{{ item }}</span></template>\n<script setup lang="ts">const items = [1, 2];</script>\n',
    (file) => {
      assert.equal(isResidual(file), true);
      const result = runEs(file);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /vue\/require-v-for-key/u);
    },
  );
});

test('ESLint residual must reject prohibited product time formatting', async () => {
  await probe(
    'packages/ai-ui/src/__quality_oxc_time_probe.ts',
    'export const x = new Date().toLocaleDateString();\n',
    (file) => {
      assert.equal(isResidual(file), true);
      const result = runEs(file);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /no-restricted-syntax/u);
    },
  );
});

test('ESLint residual keeps Storybook rules for stories with no default export', async () => {
  await probe(
    'packages/ui-vue-shadcn/src/components/ui/button/__quality_oxc_story_probe.stories.ts',
    "export const Primary = { args: { label: 'Run' } };\n",
    (file) => {
      assert.equal(isResidual(file), true);
      const result = runEs(file);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stdout + result.stderr, /storybook\//u);
    },
  );
});
