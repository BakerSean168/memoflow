import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repositoryRoot = process.cwd();
const registry = JSON.parse(
  readFileSync(
    path.join(repositoryRoot, 'tools/test-system-v2/storybook-component-registry.json'),
    'utf8',
  ),
);
const storybookDirectory = path.join(repositoryRoot, 'apps/storybook/.storybook');
const catalogGlobs = readCatalogGlobs();
const catalogPatterns = catalogGlobs.map((glob) => path.resolve(storybookDirectory, glob));

function readCatalogGlobs() {
  const source = readFileSync(path.join(storybookDirectory, 'main.ts'), 'utf8');
  const branch = /stories:\s*process\.env\.VITEST\s*\?\s*browserTestStories\s*: \[/.exec(source);
  assert.ok(
    branch,
    'main.ts must keep the VITEST branch on browserTestStories and hold catalog globs in a literal array',
  );

  const start = branch.index + branch[0].length;
  const end = source.indexOf('],', start);
  assert.notEqual(end, -1, 'main.ts catalog glob array must be closed');

  const globs = [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(globs.length > 0, 'main.ts must declare at least one catalog glob');
  assert.ok(
    globs.every(
      (glob) => glob.endsWith('stories.@(js|jsx|ts|tsx|vue)') || glob.endsWith('.stories.ts'),
    ),
    'every catalog entry must point at story files',
  );
  return globs;
}

function catalogCollects(storyPath) {
  const absoluteStory = path.resolve(repositoryRoot, storyPath);
  return catalogPatterns.some((pattern) => path.matchesGlob(absoluteStory, pattern));
}

function validateRegistry(candidate) {
  const issues = [];

  if (candidate.version !== 1) {
    issues.push(`unexpected-version:${candidate.version}`);
  }
  if (!['staged', 'full'].includes(candidate.enforcement)) {
    issues.push(`unknown-enforcement:${candidate.enforcement}`);
  }

  const seenPaths = new Set();
  for (const [index, entry] of (candidate.entries ?? []).entries()) {
    const label = entry.path ?? `entry#${index}`;
    if (!entry.path || !entry.package || !entry.storyPath) {
      issues.push(`entry-incomplete:${label}`);
      continue;
    }
    if (!['component', 'family'].includes(entry.kind)) {
      issues.push(`unknown-kind:${label}`);
    }
    if (!['present', 'planned'].includes(entry.status)) {
      issues.push(`unknown-status:${label}`);
    }
    if (seenPaths.has(entry.path)) {
      issues.push(`duplicate-path:${label}`);
    }
    seenPaths.add(entry.path);

    if (!existsSync(path.resolve(repositoryRoot, entry.path))) {
      issues.push(`missing-component:${label}`);
    }
    if (!catalogCollects(entry.storyPath)) {
      issues.push(`story-outside-catalog:${label}`);
      continue;
    }
    if (entry.status === 'present' && !existsSync(path.resolve(repositoryRoot, entry.storyPath))) {
      issues.push(`missing-story:${label}`);
    }
  }

  const planned = (candidate.entries ?? []).filter((entry) => entry.status === 'planned');
  if (candidate.enforcement === 'full' && planned.length > 0) {
    issues.push(`planned-entries-block-full-enforcement:${planned.length}`);
  }

  return issues;
}

test('every registered component and catalog story is real', () => {
  assert.deepEqual(validateRegistry(registry), []);
});

test('present entries surface a story that Storybook catalogues', () => {
  const present = registry.entries.filter((entry) => entry.status === 'present');
  assert.ok(present.length > 0, 'the registry must start with landed stories');

  for (const entry of present) {
    assert.ok(existsSync(path.resolve(repositoryRoot, entry.storyPath)), entry.storyPath);
    assert.ok(
      catalogCollects(entry.storyPath),
      `${entry.storyPath} is not collected by apps/storybook/.storybook/main.ts`,
    );
  }
});

test('planned gaps stay visible in CI output', (t) => {
  const present = registry.entries.filter((entry) => entry.status === 'present');
  const planned = registry.entries.filter((entry) => entry.status === 'planned');

  t.diagnostic(
    `storybook registry: ${present.length} present, ${planned.length} planned, enforcement=${registry.enforcement}`,
  );
  assert.equal(present.length + planned.length, registry.entries.length);
  if (registry.enforcement === 'full') {
    assert.deepEqual(planned, [], 'full enforcement cannot ship while planned entries remain');
  }
});

test('registry validation fails closed for stale paths, renamed stories and unknown statuses', () => {
  const invalid = structuredClone(registry);
  invalid.entries[0].path = 'packages/ui-vue-shadcn/src/components/ui/does-not-exist';
  invalid.entries[1].storyPath =
    'packages/ui-vue-shadcn/src/components/ui/missing/Renamed.stories.ts';
  invalid.entries[2].status = 'guessed';

  const issues = validateRegistry(invalid);
  for (const prefix of ['missing-component:', 'missing-story:', 'unknown-status:']) {
    assert.ok(
      issues.some((issue) => issue.startsWith(prefix)),
      `${prefix} must be reported`,
    );
  }
});

test('stories outside every catalog glob cannot satisfy a registry entry', () => {
  const invalid = structuredClone(registry);
  invalid.entries[0].storyPath = 'apps/storybook/.storybook/Uncollected.stories.ts';

  assert.ok(
    validateRegistry(invalid).some(
      (issue) => issue.startsWith('story-outside-catalog:') && issue.includes('accordion'),
    ),
  );
});

test('full enforcement rejects planned entries while staged enforcement reports them', () => {
  const staged = structuredClone(registry);
  staged.enforcement = 'staged';
  if (staged.entries.every((entry) => entry.status === 'present')) {
    staged.entries[0].status = 'planned';
  }
  assert.ok(
    validateRegistry(staged).every(
      (issue) => !issue.startsWith('planned-entries-block-full-enforcement:'),
    ),
  );

  const full = structuredClone(staged);
  full.enforcement = 'full';
  assert.ok(
    validateRegistry(full).some((issue) =>
      issue.startsWith('planned-entries-block-full-enforcement:'),
    ),
  );
});

test('every package with Vue components is catalogued', () => {
  const packagesDirectory = path.join(repositoryRoot, 'packages');
  const uncatalogued = readdirSync(packagesDirectory)
    .filter((name) => existsSync(path.join(packagesDirectory, name, 'src')))
    .filter((name) => {
      const sourceFiles = readdirSync(path.join(packagesDirectory, name, 'src'), {
        recursive: true,
        encoding: 'utf8',
      });
      const hasVueComponents = sourceFiles.some((file) => file.endsWith('.vue'));
      const isCatalogued = catalogGlobs.some((glob) => glob.includes(`packages/${name}/`));
      return hasVueComponents && !isCatalogued;
    });

  assert.deepEqual(
    uncatalogued,
    [],
    'a package with Vue components must have a catalog glob in apps/storybook/.storybook/main.ts',
  );
});

test('the VITEST branch keeps only audited browser suites', () => {
  const source = readFileSync(path.join(storybookDirectory, 'main.ts'), 'utf8');
  const branch = /stories:\s*process\.env\.VITEST\s*\?\s*browserTestStories\s*:/.exec(source);
  assert.ok(branch, 'the VITEST branch must reference browserTestStories directly');

  const browserList = /const browserTestStories = \[([\s\S]*?)\];/.exec(source);
  assert.ok(browserList, 'main.ts must define the audited browser suite list');
  const entries = [...browserList[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(entries, [
    '../../../apps/web/src/auth/WebAuthView.stories.ts',
    '../../../packages/goal-ui/src/components/dialogs/GoalDialog.stories.ts',
    '../../../packages/task-ui/src/components/TaskPlanForm/TaskPlanForm.stories.ts',
    '../../../packages/app-vue/src/shared/components/__stories__/BrowserInteraction.stories.ts',
  ]);
});
