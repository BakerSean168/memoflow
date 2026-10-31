import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTestArchitecture,
  classifySemanticTest,
  VERIFICATION_DIMENSIONS,
  TEST_TYPES,
  EXECUTION_PHASES,
} from '../lib/semantic-architecture.mjs';
import { loadReviewRegistry, validateReviewRegistry } from '../lib/architecture-review.mjs';
import {
  analyzeInventory,
  buildInventory,
  classifyTest,
  collectTestFiles,
} from '../lib/test-inventory.mjs';

const repositoryRoot = process.cwd();
const [repositoryInventory, repositoryTestFiles] = await Promise.all([
  buildInventory(repositoryRoot),
  collectTestFiles(repositoryRoot),
]);
const repositoryArchitecture = await buildTestArchitecture(repositoryRoot, {
  inventory: repositoryInventory,
});
// One monotonic review-registry checkpoint, rather than six scattered magic counts.
const REVIEWED_FILE_SAMPLE_COUNT = 174;

test('classifies explicit boundary and measurement file names', () => {
  assert.equal(classifyTest('apps/desktop/src/main/ipc/system-handlers.spec.ts'), 'boundary-ipc');
  assert.equal(classifyTest('apps/desktop/src/main/database/db.spec.ts'), 'boundary-main');
  assert.equal(classifyTest('packages/task/src/repository.integration.test.ts'), 'integration');
  assert.equal(classifyTest('packages/task/src/sort.bench.ts'), 'perf');
});

test('gives every Desktop primary file exactly one owner', async () => {
  const desktop = repositoryInventory.primary.filter((entry) =>
    entry.path.startsWith('apps/desktop/src/'),
  );
  const desktopFiles = repositoryTestFiles.filter((file) => file.startsWith('apps/desktop/src/'));

  assert.deepEqual(
    desktop.map((entry) => entry.path),
    desktopFiles,
    'every Desktop test file must have exactly one primary inventory entry',
  );
  assert.equal(new Set(desktop.map((entry) => entry.path)).size, desktopFiles.length);
  for (const entry of desktop) {
    assert.equal(
      entry.primarySuite,
      classifyTest(entry.path),
      `Desktop test must stay in its classified primary suite: ${entry.path}`,
    );
  }
  assert.deepEqual(repositoryInventory.missing, []);
  assert.deepEqual(repositoryInventory.duplicate, []);
  assert.deepEqual(repositoryInventory.unexpected, []);
  assert.deepEqual(repositoryInventory.measurementOnly, []);
});

test('primary collectors always own at least one test file', async () => {
  const emptyPrimaryCollectors = repositoryInventory.collectors
    .filter((collector) => collector.type === 'primary' && collector.fileCount === 0)
    .map((collector) => collector.id);

  assert.deepEqual(
    emptyPrimaryCollectors,
    [],
    'a configured primary test target must not silently collect zero files',
  );
});

test('reports missing, duplicate, unexpected and measurement-only collectors', () => {
  const files = [
    'apps/example/src/unit.spec.ts',
    'apps/desktop/src/main/ipc/example.ipc.spec.ts',
    'packages/example/src/missing.spec.ts',
    'packages/example/src/measurement.spec.ts',
  ];
  const inventory = analyzeInventory(files, [
    {
      id: 'apps/example/vitest.config.ts',
      type: 'primary',
      suite: 'unit',
      runner: 'vitest',
      files: [files[0], files[1], 'apps/example/src/not-a-test.ts'],
    },
    {
      id: 'apps/desktop/vitest.ipc.config.ts',
      type: 'primary',
      suite: 'boundary-ipc',
      runner: 'vitest',
      files: [files[1]],
    },
    {
      id: 'packages/example/vitest.coverage.config.ts',
      type: 'measurement',
      suite: 'coverage',
      runner: 'vitest',
      files: [files[0], files[3]],
    },
  ]);

  assert.deepEqual(inventory.missing, [files[3], files[2]]);
  assert.deepEqual(inventory.duplicate, [
    {
      path: files[1],
      suites: ['boundary-ipc', 'unit'],
      collectors: ['apps/desktop/vitest.ipc.config.ts', 'apps/example/vitest.config.ts'],
    },
  ]);
  assert.deepEqual(inventory.measurementOnly, [
    {
      path: files[3],
      collectors: ['packages/example/vitest.coverage.config.ts'],
    },
  ]);
  assert.deepEqual(inventory.unexpected, [
    {
      collector: 'apps/example/vitest.config.ts',
      path: 'apps/example/src/not-a-test.ts',
      reason: 'non-inventory-file',
    },
  ]);
});

test('semantic testing roles remain separate from primary execution ownership', () => {
  const path = 'packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.spec.ts';
  const sample = classifySemanticTest(
    {
      path,
      primarySuite: 'unit',
      collectors: ['packages/app-vue/vitest.config.ts'],
    },
    "import { mount } from '@vue/test-utils';\nconst wrapper = mount(GoalDialog);\nit('renders form', () => {});",
  );
  assert.equal(sample.primarySuite, 'unit');
  assert.equal(sample.testType, 'component');
  assert.equal(sample.boundary, 'simulated-dom');
  assert.equal(sample.domain, 'goal');
  assert.equal(sample.classificationStatus, 'inferred-not-assertion-reviewed');

  const structural = classifySemanticTest(
    {
      path: 'packages/app-vue/src/modules/task/components/Legacy.spec.ts',
      primarySuite: 'unit',
      collectors: ['packages/app-vue/vitest.config.ts'],
    },
    "const source = readFileSync('Legacy.vue'); expect(source).toContain('data-testid');",
  );
  assert.equal(structural.testType, null);
  assert.equal(structural.testRole, 'source-constraint');
  assert.deepEqual(structural.verificationDimensions, []);
  assert.ok(structural.flags.includes('verify-source-lock-belongs-in-governance'));

  const contract = classifySemanticTest(
    {
      path: 'packages/contracts/src/result/ipc-envelope.surface.spec.ts',
      primarySuite: 'unit',
      collectors: ['packages/contracts/vitest.config.ts'],
    },
    "it('rejects raw payload', () => { expect(isIpcResultEnvelope('raw')).toBe(false); });",
  );
  assert.equal(contract.testType, 'contract');
  assert.equal(contract.primarySuite, 'unit');
});

test('the semantic inventory preserves the primary file set without claiming behavior proof', () => {
  assert.deepEqual(repositoryArchitecture.issues, []);
  assert.equal(repositoryArchitecture.version, 2);
  assert.equal(repositoryArchitecture.summary.primaryFiles, repositoryInventory.primary.length);
  assert.equal(
    repositoryArchitecture.summary.unreviewedSemanticFiles +
      repositoryArchitecture.summary.review.reviewedPrimaryFiles,
    repositoryInventory.primary.length,
  );
  assert.deepEqual(
    repositoryArchitecture.entries.map((item) => item.path),
    repositoryInventory.primary.map((item) => item.path),
  );
  assert.equal(
    new Set(repositoryArchitecture.entries.map((item) => item.path)).size,
    repositoryInventory.primary.length,
  );
  assert.ok(repositoryArchitecture.summary.byTestType.component > 0);
  assert.ok(repositoryArchitecture.summary.byTestRole['source-constraint'] > 0);
  assert.deepEqual(repositoryArchitecture.taxonomy.testTypes, TEST_TYPES);
  assert.deepEqual(repositoryArchitecture.taxonomy.verificationDimensions, VERIFICATION_DIMENSIONS);
  assert.deepEqual(repositoryArchitecture.taxonomy.executionPhases, EXECUTION_PHASES);
  assert.ok(repositoryArchitecture.summary.stories >= 1);
  assert.ok(
    repositoryArchitecture.stories.every(
      (story) => story.executionStatus === 'storybook-scenario-ci-not-verified',
    ),
  );
});

test('risk matrix keeps specialized E2E outside required PR evidence', () => {
  const sync = repositoryArchitecture.riskMatrix.find((entry) => entry.id === 'WEB-DESKTOP-SYNC');
  const e2e = sync.evidence.find(
    (entry) => entry.path === 'apps/web/e2e/sync/goal-sync-regression.spec.ts',
  );
  assert.equal(e2e.testType, 'e2e');
  assert.equal(e2e.e2eLane, 'specialized');
  assert.equal(e2e.declaredAutomation, true);
  assert.equal(e2e.executionPhases.pr.status, 'not-confirmed');
  assert.equal(e2e.executionPhases.nightly.status, 'conditional');
  assert.ok(!sync.missingDesiredPhases.includes('nightly'));
  assert.equal(sync.assessment, 'explicit-gap');

  const migration = repositoryArchitecture.riskMatrix.find(
    (entry) => entry.id === 'DATA-MIGRATION',
  );
  assert.deepEqual(migration.missingExpectedTypes, []);
  const postgres = migration.evidence.find(
    (item) =>
      item.path === 'packages/database/src/schema/account-setting-cutover.integration.test.ts',
  );
  assert.deepEqual(postgres.confirmedDependencies, ['database']);
  assert.equal(postgres.review, 'assertion-reviewed');
  assert.ok(migration.missingDesiredPhases.includes('release'));
  assert.equal(migration.assessment, 'explicit-gap');
});

test('semantic risk governance fails closed on absent or invalid evidence', async () => {
  const inventory = {
    ...repositoryInventory,
    primary: repositoryInventory.primary.slice(0, 1),
  };
  const empty = await buildTestArchitecture(repositoryRoot, {
    inventory,
    matrix: { version: 2, scenarios: [] },
  });
  assert.ok(empty.issues.includes('risk-matrix-is-empty'));

  const invalid = await buildTestArchitecture(repositoryRoot, {
    inventory,
    matrix: {
      version: 2,
      scenarios: [
        {
          id: 'BROKEN',
          severity: 'P0',
          domain: 'test',
          behavior: 'should reject untracked evidence',
          failureImpact: 'silent CI coverage hole',
          expectedTypes: ['integration'],
          expectedDimensions: ['functional'],
          evidence: [
            {
              path: 'apps/missing.spec.ts',
              review: 'candidate',
              behaviorClaim: 'not collected',
            },
          ],
        },
      ],
    },
  });
  assert.ok(invalid.issues.some((issue) => issue.startsWith('evidence-not-in-primary-inventory:')));
});

test('four dimensions stay orthogonal for UI, Electron and AI evaluation cases', () => {
  const byPath = (file) => repositoryArchitecture.entries.find((entry) => entry.path === file);
  const visual = byPath('apps/web/e2e/visual-regression/matrix.spec.ts');
  assert.equal(visual.testType, 'e2e');
  assert.equal(visual.executionEnvironment.runtime, 'real-browser');
  assert.ok(visual.verificationDimensions.includes('visual'));
  assert.ok(visual.verificationDimensions.includes('accessibility'));
  assert.ok(visual.verificationDimensions.includes('functional'));
  assert.ok(visual.verificationEvidence.every((e) => e.reviewStatus === 'candidate'));

  const component = byPath(
    'packages/task-ui/src/components/TaskPlanForm/widgets/selectors-accessibility.spec.ts',
  );
  assert.equal(component.primarySuite, 'unit');
  assert.equal(component.testType, 'component');
  assert.equal(component.executionEnvironment.runtime, 'simulated-dom');
  assert.ok(component.verificationDimensions.includes('accessibility'));

  const ipc = byPath('apps/desktop/e2e/workspace-ipc.spec.mts');
  assert.equal(ipc.testType, 'e2e');
  assert.equal(ipc.executionEnvironment.runtime, 'electron');

  const evalHarness = byPath('packages/ai/src/evals/eval-runner.spec.ts');
  assert.equal(evalHarness.testType, 'unit');
  assert.ok(evalHarness.verificationDimensions.includes('ai-evaluation'));
  assert.equal(evalHarness.evaluationMode, 'recorded-replay');
  const reportAdapter = byPath(
    'packages/ai/src/server/infrastructure/adapters/fs/__tests__/ai-evaluation-report-file.adapter.test.ts',
  );
  assert.ok(!reportAdapter.verificationDimensions.includes('ai-evaluation'));
});

test('execution phases describe potential selection but never claim a file ran', () => {
  const auth = repositoryArchitecture.entries.find(
    (entry) => entry.path === 'apps/web/e2e/account/account-profile.spec.ts',
  );
  const sync = repositoryArchitecture.entries.find(
    (entry) => entry.path === 'apps/web/e2e/sync/goal-sync-regression.spec.ts',
  );

  assert.equal(auth.execution.e2eLane, 'nightly');
  assert.equal(auth.executionPhases.pr.status, 'not-confirmed');
  assert.equal(auth.executionPhases.nightly.status, 'conditional');
  assert.equal(auth.executionPhases.release.status, 'not-confirmed');
  assert.equal(sync.execution.e2eLane, 'specialized');
  assert.equal(sync.executionPhases.local.status, 'available');
  assert.equal(sync.executionPhases.pr.status, 'not-confirmed');
  assert.equal(sync.executionPhases.nightly.status, 'conditional');
});

test('auxiliary smoke, governance and source checks are not extra test levels', () => {
  const smoke = repositoryArchitecture.entries.find(
    (entry) => entry.path === 'apps/api/src/__tests__/smoke/task/task-occurrence.smoke.test.ts',
  );
  assert.equal(smoke.testRole, 'smoke');
  assert.equal(smoke.testType, 'integration');

  const governance = repositoryArchitecture.entries.find(
    (entry) => entry.path === 'tools/test-system-v2/__tests__/inventory.test.mjs',
  );
  assert.equal(governance.testRole, 'governance');
  assert.equal(governance.testType, null);
  assert.deepEqual(governance.verificationDimensions, []);

  const classified = Object.values(repositoryArchitecture.summary.byTestType).reduce(
    (sum, n) => sum + n,
    0,
  );
  const auxiliary =
    repositoryArchitecture.summary.byTestRole.governance +
    repositoryArchitecture.summary.byTestRole['source-constraint'];
  assert.equal(classified + auxiliary, repositoryInventory.primary.length);
});

test('risk matrix treats AI evaluation and accessibility as reviewable dimensions', () => {
  const ai = repositoryArchitecture.riskMatrix.find((entry) => entry.id === 'AI-EVAL-QUALITY');
  assert.ok(ai.expectedDimensions.includes('ai-evaluation'));
  assert.equal(ai.missingExpectedDimensions.length, 0);
  assert.ok(ai.missingExpectedEnvironments.includes('external-service'));
  assert.equal(ai.assessment, 'explicit-gap');

  const a11y = repositoryArchitecture.riskMatrix.find(
    (entry) => entry.id === 'TASK-RECURRENCE-A11Y',
  );
  assert.ok(a11y.expectedDimensions.includes('accessibility'));
  assert.ok(a11y.evidence.some((e) => e.verifiedDimensions.includes('accessibility')));

  const visual = repositoryArchitecture.riskMatrix.find((entry) => entry.id === 'VISUAL-LAYOUT');
  assert.ok(visual.expectedDimensions.includes('visual'));
  assert.ok(visual.expectedDimensions.includes('accessibility'));
  assert.equal(visual.assessment, 'explicit-gap');
});

test('risk metadata rejects unreviewed dimension assertions and unknown taxonomy values', async () => {
  const partialInventory = {
    ...repositoryInventory,
    primary: repositoryInventory.primary.slice(0, 1),
  };
  const report = await buildTestArchitecture(repositoryRoot, {
    inventory: partialInventory,
    matrix: {
      version: 2,
      scenarios: [
        {
          id: 'INVALID-DIM',
          severity: 'P0',
          domain: 'account',
          behavior: 'invalid',
          failureImpact: 'invalid',
          expectedTypes: ['governance'],
          expectedDimensions: ['made-up-dimension'],
          expectedEnvironments: ['in-process'],
          desiredPhases: ['continuous'],
          evidence: [
            {
              path: partialInventory.primary[0].path,
              review: 'candidate',
              behaviorClaim: 'not-reviewed',
              verifiedDimensions: ['security'],
            },
          ],
        },
      ],
    },
  });
  assert.ok(report.issues.some((issue) => issue.startsWith('unknown-test-type:')));
  assert.ok(report.issues.some((issue) => issue.startsWith('unknown-dimension:')));
  assert.ok(report.issues.some((issue) => issue.startsWith('unknown-environment:')));
  assert.ok(report.issues.some((issue) => issue.startsWith('unknown-phase:')));
  assert.ok(report.issues.some((issue) => issue.startsWith('unreviewed-dimension-claim:')));
});

test('T2 sampled review corrects false structural and contract classification without touching collectors', () => {
  assert.equal(
    repositoryArchitecture.summary.review.reviewedPrimaryFiles,
    REVIEWED_FILE_SAMPLE_COUNT,
  );
  assert.equal(repositoryArchitecture.summary.review.reviewedStoryFiles, 0);
  assert.equal(repositoryArchitecture.summary.review.overlapGroups, 3);
  assert.equal(repositoryArchitecture.summary.review.retirementApproved, 0);
  assert.equal(repositoryArchitecture.summary.review.warnings, 0);
  const byPath = (path) => repositoryArchitecture.entries.find((entry) => entry.path === path);
  for (const [path, correctedType] of [
    ['packages/ai/src/server/local-agent/local-agent-runtime.spec.ts', 'integration'],
    ['apps/desktop/src/main/profile/ProfileSnapshotService.spec.ts', 'unit'],
  ]) {
    const entry = byPath(path);
    assert.equal(entry.inferredBeforeReview.testRole, 'source-constraint', path);
    assert.equal(entry.reviewStatus, 'reviewed-sample', path);
    assert.equal(entry.testType, correctedType, path);
    assert.equal(entry.testRole, 'behavior', path);
    assert.equal(entry.primarySuite, 'unit', path);
    assert.equal(entry.classificationStatus, 'reviewed-primary-intent-not-all-assertions');
    assert.ok(entry.verificationDimensions.includes('functional'));
    assert.notEqual(entry.boundary, 'source-inspection');
  }
});

test('T2 reviewed real Postgres and mocked DB integration are not conflated', () => {
  const byPath = (path) => repositoryArchitecture.entries.find((entry) => entry.path === path);
  const pg = byPath('packages/database/src/schema/account-setting-cutover.integration.test.ts');
  const mocked = byPath(
    'apps/api/src/__tests__/integration/express-auth-closure.integration.test.ts',
  );
  assert.deepEqual(pg.executionEnvironment.confirmedDependencies, ['database']);
  assert.deepEqual(mocked.executionEnvironment.confirmedDependencies, []);
  assert.deepEqual(mocked.executionEnvironment.dependencyCandidates, []);
  assert.equal(pg.reviewDecision, 'retain');
  assert.equal(mocked.primarySuite, 'integration');
  assert.equal(pg.primarySuite, 'integration');
});

test('T2 web browser fixture tests are components without changing Playwright ownership', () => {
  for (const path of [
    'apps/web/e2e/goal/reference/goal-reference.spec.ts',
    'apps/web/e2e/schedule/presentation-authority/collision-regression.spec.ts',
    'apps/web/e2e/schedule/presentation-authority/schedule-presentation-authority.spec.ts',
    'apps/web/e2e/schedule/presentation-authority/task-quick.spec.ts',
  ]) {
    const entry = repositoryArchitecture.entries.find((row) => row.path === path);
    assert.ok(entry, path);
    assert.equal(entry.testType, 'component', path);
    assert.equal(entry.testRole, 'behavior', path);
    assert.equal(entry.boundary, 'browser-component-fixture', path);
    assert.equal(entry.executionEnvironment.runtime, 'real-browser', path);
    assert.equal(entry.executionEnvironment.runner, 'playwright', path);
    assert.equal(entry.reviewStatus, 'reviewed-sample', path);
    assert.equal(entry.purpose, 'browser-component-or-visual-fixture', path);
  }
});

test('T2 distinguishes integration database requirements from Redis and fake module composition', () => {
  const entry = (path) => {
    const value = repositoryArchitecture.entries.find((row) => row.path === path);
    assert.ok(value, path);
    return value;
  };
  for (const path of [
    'apps/api/src/__tests__/integration/agent-instance-registry.integration.test.ts',
  ]) {
    assert.deepEqual(entry(path).executionEnvironment.confirmedDependencies, ['database'], path);
  }
  const redis = entry('apps/api/src/modules/agent-gateway/pilot-admission.integration.test.ts');
  assert.deepEqual(redis.executionEnvironment.confirmedDependencies, ['external-service']);
  for (const path of [
    'apps/api/src/__tests__/smoke/task/task-plan.smoke.test.ts',
    'apps/api/src/runtime/compose-data-portability.spec.ts',
    'packages/account/src/server/infrastructure/__tests__/account-repositories.surface.spec.ts',
  ]) {
    assert.equal(entry(path).testType, 'integration', path);
    assert.deepEqual(entry(path).executionEnvironment.confirmedDependencies, [], path);
    assert.deepEqual(entry(path).executionEnvironment.dependencyCandidates, [], path);
  }
  for (const path of [
    'apps/api/src/shared/infrastructure/config/web-origin.spec.ts',
    'packages/database/src/schema/goal-start-timeframe-semantics.spec.ts',
    'packages/time/src/__tests__/facade.spec.ts',
  ]) {
    assert.equal(entry(path).testType, 'unit', path);
    assert.equal(entry(path).testRole, 'behavior', path);
  }
  assert.equal(
    entry('packages/database/src/schema/task-plan-canonical-persistence.spec.ts').testRole,
    'source-constraint',
  );
});

test('T2 Storybook scenarios and overlap relationships are tracked separately', () => {
  assert.equal(repositoryArchitecture.overlapGroups.length, 3);
  assert.ok(
    repositoryArchitecture.overlapGroups.every(
      (group) => group.retirementDecision === 'blocked-no-equivalent-replacement',
    ),
  );
  assert.ok(
    repositoryArchitecture.overlapGroups.every((group) => group.assessment === 'complementary'),
  );
});

test('T2 registry fails closed for incorrect classification, paths and unverified retirement', async () => {
  const original = await loadReviewRegistry(repositoryRoot);
  const invalid = structuredClone(original);
  invalid.reviews[0].classification.testType = 'guessed-new-type';
  invalid.reviews[0].decision = 'retire';
  invalid.reviews[0].replacement = { status: 'verified', testFiles: [] };
  invalid.overlapGroups[0].paths.push('apps/does-not-exist.spec.ts');
  invalid.storyReviews = [{ path: 'packages/missing.stories.ts' }];
  const validation = validateReviewRegistry(
    invalid,
    repositoryArchitecture.entries,
    repositoryArchitecture.stories,
  );
  for (const prefix of [
    'review-invalid-classification:',
    'review-invalid-decision:',
    'review-unverified-retirement:',
    'review-overlap-path-missing:',
    'review-story-not-found:',
  ]) {
    assert.ok(
      validation.issues.some((issue) => issue.startsWith(prefix)),
      prefix,
    );
  }
});

test('T2 stale source digest removes review override and downgrades reviewed risk evidence', async () => {
  const registry = await loadReviewRegistry(repositoryRoot);
  const changed = structuredClone(registry);
  const file = 'packages/database/src/schema/account-setting-cutover.integration.test.ts';
  changed.reviews.find((item) => item.path === file).sourceSha256 = 'a'.repeat(64);
  const result = await buildTestArchitecture(repositoryRoot, {
    inventory: repositoryInventory,
    reviewRegistry: changed,
  });
  const entry = result.entries.find((item) => item.path === file);
  assert.equal(entry.reviewStatus, 'stale-review');
  assert.equal(entry.classificationStatus, 'inferred-not-assertion-reviewed');
  assert.equal(result.summary.review.reviewedPrimaryFiles, REVIEWED_FILE_SAMPLE_COUNT - 1);
  assert.ok(result.reviewWarnings.includes('stale-review-not-applied:' + file));
  const auth = result.riskMatrix.find((item) => item.id === 'DATA-MIGRATION');
  const evidence = auth.evidence.find((item) => item.path === file);
  assert.equal(evidence.review, 'candidate');
  assert.deepEqual(evidence.verifiedDimensions, []);
  assert.deepEqual(result.issues, []);
});

test('release Windows installed-E2E is distinct from PR/Nightly phase metadata', () => {
  const expected = [
    'apps/desktop/e2e/workspace-ipc.spec.mts',
    'apps/desktop/e2e/workspace-attention.spec.mts',
    'apps/desktop/e2e/antigravity-composer.spec.mts',
    'apps/desktop/e2e/native-codex-unconfigured-installed.spec.mts',
    'apps/desktop/e2e/native-goal-panel-installed.spec.mts',
    'apps/desktop/e2e/native-codex-goal-integrated-installed.spec.mts',
  ];
  const declared = repositoryArchitecture.entries
    .filter((entry) => entry.executionPhases.release.status === 'conditional')
    .map((entry) => entry.path)
    .sort();
  assert.deepEqual(declared, expected.sort());
  const workspace = repositoryArchitecture.entries.find(
    (entry) => entry.path === 'apps/desktop/e2e/workspace-ipc.spec.mts',
  );
  assert.equal(workspace.executionPhases.pr.status, 'not-confirmed');
  assert.equal(workspace.executionPhases.release.status, 'conditional');
  assert.match(workspace.executionPhases.release.basis, /desktop-update-e2e/);
  const sync = repositoryArchitecture.entries.find(
    (entry) => entry.path === 'apps/web/e2e/sync/goal-sync-regression.spec.ts',
  );
  assert.equal(sync.executionPhases.release.status, 'not-confirmed');
});

test('review resolution metadata fails closed, and stale source reopens a resolved signal', async () => {
  const original = await loadReviewRegistry(repositoryRoot);
  const modified = structuredClone(original);
  const file = 'tools/ci-cd-platform/__tests__/failure-matrix.test.mjs';
  const resolution = modified.reviews.find((r) => r.path === file);
  const preserved = resolution.sourceSha256;
  assert.ok(resolution.resolvedFindings.some((f) => f.id === 'no-direct-assertion'));
  resolution.resolvedFindings[0].disposition = 'silently-ignore';
  const validation = validateReviewRegistry(
    modified,
    repositoryArchitecture.entries,
    repositoryArchitecture.stories,
  );
  assert.ok(
    validation.issues.some((issue) => issue.startsWith('review-invalid-finding-resolution:')),
  );
  resolution.resolvedFindings[0].disposition = 'expected-behavior';
  resolution.sourceSha256 = 'a'.repeat(64);
  assert.notEqual(resolution.sourceSha256, preserved);
  const stale = await buildTestArchitecture(repositoryRoot, {
    inventory: repositoryInventory,
    reviewRegistry: modified,
  });
  assert.ok(stale.reviewWarnings.includes('stale-review-not-applied:' + file));
});

test('integration dependency inference distinguishes Postgres, Redis, and in-memory behavior', () => {
  const get = (path) => repositoryArchitecture.entries.find((entry) => entry.path === path);
  const redis = get('apps/api/src/modules/agent-gateway/pilot-admission.integration.test.ts');
  assert.equal(redis.testType, 'integration');
  assert.deepEqual(redis.executionEnvironment.confirmedDependencies, ['external-service']);
  assert.deepEqual(redis.executionEnvironment.dependencyCandidates, []);
  const memory = get(
    'packages/account/src/server/application/services/__tests__/account-closure-coordinator.integration.spec.ts',
  );
  assert.deepEqual(memory.executionEnvironment.confirmedDependencies, []);
  assert.deepEqual(memory.executionEnvironment.dependencyCandidates, []);
  const postgres = get(
    'apps/api/src/modules/powersync/user-preference-crud-executor.postgres.integration.spec.ts',
  );
  assert.deepEqual(postgres.executionEnvironment.confirmedDependencies, ['database']);
  assert.deepEqual(postgres.executionEnvironment.dependencyCandidates, []);
});

test('inventory serialization is independent of filesystem collector order', () => {
  const files = ['apps/desktop/src/example.spec.ts', 'apps/web/src/example.spec.ts'];
  const collectors = [
    {
      id: 'apps/web/vitest.config.ts',
      type: 'primary',
      suite: 'unit',
      runner: 'vitest',
      files: [files[1]],
    },
    {
      id: 'apps/desktop/vitest.config.ts',
      type: 'primary',
      suite: 'unit',
      runner: 'vitest',
      files: [files[0]],
    },
  ];

  assert.deepEqual(
    analyzeInventory(files, collectors),
    analyzeInventory(files, [...collectors].reverse()),
  );
});
