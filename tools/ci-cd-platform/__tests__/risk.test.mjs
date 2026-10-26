import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyCapabilities,
  classifyRisk,
  selectLanes,
  webFlowCandidateFiles,
} from '../lib/risk.mjs';

test('classifies highest-risk root and release changes', () => {
  assert.equal(classifyRisk(['docs/README.md']).level, 'docs');
  assert.equal(classifyRisk(['packages/task/src/foo.ts']).level, 'package');
  const desktop = classifyRisk([
    'apps/desktop/src/main/main.ts',
    'packages/repository/src/electron/local-vault-runtime.ts',
  ]);
  assert.equal(desktop.level, 'desktop');
  assert.ok(desktop.matchedLevels.includes('desktop'));
  assert.ok(!desktop.matchedLevels.includes('web-flow'));
  assert.equal(
    classifyRisk(['apps/web/e2e/foo.spec.ts', 'apps/api/src/routes.ts']).level,
    'web-flow',
  );
  assert.equal(classifyRisk(['.github/workflows/ci.yml']).level, 'root');
  assert.equal(classifyRisk(['.github/workflows/publish-images.yml']).level, 'release');
  assert.equal(classifyRisk(['.github/workflows/release-publish.yml']).level, 'release');
  assert.equal(classifyRisk(['.github/workflows/deploy-production.yml']).level, 'release');
  assert.equal(classifyRisk(['deployment/production/production-deploy-watch.sh']).level, 'release');
  assert.equal(classifyRisk(['tools/ci-cd-platform/production-manifest.mjs']).level, 'release');
  assert.equal(
    classifyRisk(['tools/ci-cd-platform/release-tools/release-contract.mjs']).level,
    'release',
  );
});

test('selects lanes without letting docs-only changes skip governance', () => {
  const scope = {
    boundary: [],
    smoke: [],
    integration: [],
    coverage: [],
    perf: [],
    webFlow: false,
    desktopFlow: false,
  };
  const lanes = selectLanes({
    risk: { level: 'docs', matchedLevels: ['docs'] },
    scope,
    event: 'pull_request',
  });
  assert.equal(lanes.governance, true);
  assert.equal(lanes.validate, false);
  assert.equal(lanes.web, false);
  assert.equal(lanes.integration, false);
});

test('keeps validation enabled for executable changes', () => {
  const scope = {
    boundary: [],
    smoke: [],
    integration: [],
    coverage: [],
    perf: [],
    webFlow: false,
    desktopFlow: false,
  };
  assert.equal(
    selectLanes({ risk: { level: 'package', matchedLevels: ['package'] }, scope }).validate,
    true,
  );
});

test('lanes are selected per dimension: Desktop never suppresses Web Flow', () => {
  const scope = {
    boundary: ['desktop'],
    smoke: [],
    integration: [],
    coverage: [],
    perf: [],
    desktopFlow: true,
  };
  const desktopOnly = selectLanes({
    risk: { level: 'desktop', matchedLevels: ['desktop', 'package'] },
    scope: { ...scope, webFlow: false },
  });
  assert.equal(desktopOnly.validate, true);
  assert.equal(desktopOnly.boundary, true);
  assert.equal(desktopOnly.web, false);

  const mixed = selectLanes({
    risk: { level: 'desktop', matchedLevels: ['desktop', 'package'] },
    scope: { ...scope, webFlow: true },
  });
  assert.equal(mixed.boundary, true);
  assert.equal(mixed.web, true);
});

test('Web Flow candidate files exclude Desktop-only and docs paths but keep renderer styles', () => {
  assert.deepEqual(
    webFlowCandidateFiles([
      'AGENTS.md',
      'apps/desktop/scripts/run-windows-update-e2e.ps1',
      'apps/desktop/src/main/index.ts',
      'apps/desktop/src/preload/index.ts',
      'apps/desktop/src/renderer/styles/index.css',
      'docs/test/ci-validation.md',
      'packages/app-vue/src/App.vue',
      'packages/repository/src/electron/local-vault-runtime.ts',
    ]),
    ['apps/desktop/src/renderer/styles/index.css', 'packages/app-vue/src/App.vue'],
  );
});

test('docs classification is exclusive and covers root Markdown and agent prompts', () => {
  for (const file of [
    'AGENTS.md',
    'CLAUDE.md',
    'README.md',
    '.github/prompts/dev.prompt.md',
    '.github/copilot-instructions.md',
    'docs/guides/database-integration-smoke-e2e.md',
  ]) {
    const risk = classifyRisk([file]);
    assert.equal(risk.level, 'docs', file);
    assert.deepEqual(risk.matchedLevels, ['docs'], file);
  }
  // Markdown inside executable projects is still project source.
  assert.equal(classifyRisk(['apps/web/README.md']).level, 'web-flow');
});

test('e2e / playwright words outside apps/web do not select Web Flow', () => {
  assert.deepEqual(
    classifyRisk(['apps/desktop/scripts/run-windows-update-e2e.ps1']).matchedLevels,
    ['desktop', 'package'],
  );
  assert.deepEqual(classifyRisk(['apps/desktop/e2e/workspace-ipc.spec.mts']).matchedLevels, [
    'desktop',
    'package',
  ]);
  assert.equal(classifyRisk(['apps/web/playwright.config.ts']).level, 'web-flow');
  // Unknown files with such words still fail closed.
  assert.equal(classifyRisk(['.e2e-test-credentials.json']).level, 'root');
});

test('test harness registries select validation, timing history selects Web Flow', () => {
  assert.deepEqual(classifyRisk(['tools/test-system-v2/test-inventory.json']).matchedLevels, [
    'package',
  ]);
  assert.deepEqual(classifyRisk(['tools/test-system-v2/e2e-ownership.json']).matchedLevels, [
    'package',
  ]);
  assert.equal(classifyRisk(['tools/test-system-v2/web-spec-durations.json']).level, 'web-flow');
  // Harness code stays fail-closed.
  assert.equal(classifyRisk(['tools/test-system-v2/run-web-shard.mjs']).level, 'root');
});

test('PR measurement lanes stay off even for root scope or an explicit full PR', () => {
  for (const files of [['nx.json'], ['packages/task/src/domain.ts']]) {
    for (const full of [false, true]) {
      const lanes = selectLanes({
        risk: classifyRisk(files),
        scope: { coverage: ['task'], perf: ['task'], boundary: ['desktop'], integration: ['api'] },
        event: 'pull_request',
        full,
      });
      assert.equal(lanes.coverage, false);
      assert.equal(lanes.performance, false);
      assert.equal(lanes.validate, true);
      assert.equal(lanes.boundary, true);
      assert.equal(lanes.integration, true);
    }
  }
});

test('full events enable every execution lane while coverage stays nightly-audit-only', () => {
  const lanes = selectLanes({
    risk: { level: 'docs' },
    scope: {
      boundary: [],
      smoke: [],
      integration: [],
      coverage: [],
      perf: [],
      webFlow: false,
      desktopFlow: false,
    },
    event: 'schedule',
  });
  assert.deepEqual(lanes, {
    governance: true,
    validate: true,
    boundary: true,
    integration: true,
    web: true,
    coverage: false,
    performance: true,
  });
});

test('explicit full main policy enables every execution lane while coverage stays nightly-audit-only', () => {
  const lanes = selectLanes({
    risk: { level: 'docs', matchedLevels: ['docs'] },
    scope: {
      full: true,
      boundary: [],
      smoke: [],
      integration: [],
      coverage: [],
      perf: [],
      webFlow: false,
      desktopFlow: false,
    },
    event: 'push',
    full: true,
  });
  assert.deepEqual(lanes, {
    governance: true,
    validate: true,
    boundary: true,
    integration: true,
    web: true,
    coverage: false,
    performance: true,
  });
});

test('classifyCapabilities maps stories to componentBrowser only', () => {
  const caps = classifyCapabilities({
    changedFiles: ['packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.stories.ts'],
    scope: { unit: [], integration: [], boundary: [], coverage: [], perf: [], webFlowFiles: [] },
  });
  assert.equal(caps.componentBrowser.files.length, 1);
  assert.equal(caps.fmt.files.length, 1);
  assert.equal(caps.contract.files.length, 0);
});

test('classifyCapabilities maps contract package changes to contract', () => {
  const caps = classifyCapabilities({
    changedFiles: ['packages/contracts/src/modules/goal.ts', 'docs/guide.md'],
    scope: {
      unit: ['contracts'],
      integration: [],
      boundary: [],
      coverage: [],
      perf: [],
      webFlowFiles: [],
    },
  });
  assert.deepEqual(caps.contract.files, ['packages/contracts/src/modules/goal.ts']);
  assert.deepEqual(caps.unit.projects, ['contracts']);
  assert.ok(caps.fmt.files.includes('docs/guide.md'));
  assert.equal(caps.lint.files.includes('docs/guide.md'), false);
});
