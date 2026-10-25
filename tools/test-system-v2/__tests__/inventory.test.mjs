import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  buildTestArchitecture,
  classifySemanticTest,
  VERIFICATION_DIMENSIONS,
  TEST_TYPES,
  EXECUTION_PHASES,
} from '../lib/semantic-architecture.mjs';
import { loadReviewRegistry, validateReviewRegistry } from '../lib/architecture-review.mjs';
import { inspectTestFile, buildFullAudit } from '../lib/architecture-batch-audit.mjs';
import { renderHumanReport, renderFileTable } from '../lib/architecture-audit-report.mjs';
import { analyzeFocusedSource, buildFocusedTriage } from '../lib/architecture-focus-triage.mjs';
import { renderFocusedReport } from '../lib/architecture-focus-report.mjs';
import {
  inspectAuthPrecondition,
  inspectRetirementProposal,
  declaredWebSpecs,
} from '../lib/t2-pr-evidence.mjs';
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
const REVIEWED_FILE_SAMPLE_COUNT = 433;

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
  assert.equal(e2e.declaredAutomation, false);
  assert.equal(e2e.executionPhases.pr.status, 'not-confirmed');
  assert.equal(e2e.executionPhases.nightly.status, 'not-confirmed');
  assert.ok(sync.missingDesiredPhases.includes('nightly'));
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
    'packages/app-vue/src/modules/task/components/TaskPlanForm/widgets/selectors-accessibility.spec.ts',
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
    (entry) => entry.path === 'apps/web/e2e/authentication/auth-login.spec.ts',
  );
  const sync = repositoryArchitecture.entries.find(
    (entry) => entry.path === 'apps/web/e2e/sync/goal-sync-regression.spec.ts',
  );

  assert.equal(auth.execution.e2eLane, 'required');
  assert.equal(auth.executionPhases.pr.status, 'conditional');
  assert.equal(auth.executionPhases.main.status, 'conditional');
  assert.equal(auth.executionPhases.release.status, 'not-confirmed');
  assert.equal(sync.execution.e2eLane, 'specialized');
  assert.equal(sync.executionPhases.local.status, 'available');
  assert.equal(sync.executionPhases.pr.status, 'not-confirmed');
  assert.equal(sync.executionPhases.nightly.status, 'not-confirmed');
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
  assert.equal(repositoryArchitecture.summary.review.reviewedStoryFiles, 2);
  assert.equal(repositoryArchitecture.summary.review.overlapGroups, 6);
  assert.equal(repositoryArchitecture.summary.review.retirementApproved, 0);
  assert.equal(repositoryArchitecture.summary.review.warnings, 0);
  const byPath = (path) => repositoryArchitecture.entries.find((entry) => entry.path === path);
  for (const [path, correctedType] of [
    ['packages/ai/src/server/local-agent/local-agent-runtime.spec.ts', 'integration'],
    ['packages/ai/src/server/mastra/runtime/mastra-workflow.runtime.spec.ts', 'integration'],
    ['apps/desktop/src/main/profile/ProfileSnapshotService.spec.ts', 'unit'],
    ['apps/web/src/mocks/handlers/repository.handlers.spec.ts', 'contract'],
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
  const wrapper = byPath('packages/contracts/src/electron/authenticated-ipc.spec.ts');
  assert.equal(wrapper.inferredBeforeReview.testType, 'contract');
  assert.equal(wrapper.testType, 'unit');
  assert.equal(wrapper.primarySuite, 'unit');
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
    'apps/web/e2e/goal/reference/goal-business-panel.spec.ts',
    'apps/web/e2e/goal/reference/goal-reference.spec.ts',
    'apps/web/e2e/schedule/presentation-authority/collision-regression.spec.ts',
    'apps/web/e2e/schedule/presentation-authority/schedule-presentation-authority.spec.ts',
    'apps/web/e2e/schedule/presentation-authority/task-quick.spec.ts',
    'apps/web/e2e/visual-regression/composer-footer.spec.ts',
    'apps/web/e2e/visual-regression/scrollbar-gutter.spec.ts',
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
    'packages/schedule/src/server/infrastructure/adapters/prisma/schedule-w5-real-concurrency.integration.test.ts',
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
    'packages/utils/src/shared/dual-registry.surface.spec.ts',
    'packages/time/src/__tests__/facade.spec.ts',
  ]) {
    assert.equal(entry(path).testType, 'unit', path);
    assert.equal(entry(path).testRole, 'behavior', path);
  }
  assert.equal(
    entry('packages/database/src/schema/task-plan-canonical-persistence.spec.ts').testRole,
    'source-constraint',
  );
  assert.equal(
    entry('packages/contracts/src/modules/operations/operations-dist.surface.spec.ts').testRole,
    'governance',
  );
});

test('T2 Storybook scenarios and overlap relationships are tracked separately', () => {
  for (const story of [
    'packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.stories.ts',
    'packages/app-vue/src/modules/task/components/TaskPlanForm/TaskPlanForm.stories.ts',
  ]) {
    const reviewed = repositoryArchitecture.stories.find((entry) => entry.path === story);
    assert.equal(reviewed.reviewStatus, 'reviewed-sample');
    assert.equal(reviewed.reviewedCases.length, 3);
    assert.equal(reviewed.executionStatus, 'storybook-scenario-ci-not-verified');
  }
  assert.equal(repositoryArchitecture.overlapGroups.length, 6);
  assert.ok(
    repositoryArchitecture.overlapGroups.every(
      (group) => group.retirementDecision === 'blocked-no-equivalent-replacement',
    ),
  );
  assert.ok(
    repositoryArchitecture.overlapGroups.some(
      (group) => group.id === 'TASK-A11Y' && group.assessment === 'coverage-gap',
    ),
  );
});

test('T2 registry fails closed for incorrect classification, paths and unverified retirement', async () => {
  const original = await loadReviewRegistry(repositoryRoot);
  const invalid = structuredClone(original);
  invalid.reviews[0].classification.testType = 'guessed-new-type';
  invalid.reviews[0].decision = 'retire';
  invalid.reviews[0].replacement = { status: 'verified', testFiles: [] };
  invalid.overlapGroups[0].paths.push('apps/does-not-exist.spec.ts');
  invalid.storyReviews[0].path = 'packages/missing.stories.ts';
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
  const file = 'apps/web/e2e/authentication/auth-login.spec.ts';
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
  const auth = result.riskMatrix.find((item) => item.id === 'AUTH-LOGIN');
  const evidence = auth.evidence.find((item) => item.path === file);
  assert.equal(evidence.review, 'candidate');
  assert.deepEqual(evidence.verifiedDimensions, []);
  assert.deepEqual(result.issues, []);
});

test('full AST audit distinguishes focused tests, conditional skips and delegated assertions', () => {
  const base = repositoryArchitecture.entries.find(
    (entry) =>
      entry.path === 'packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.spec.ts',
  );
  const sample = {
    ...base,
    path: 'packages/app-vue/src/tests/example.spec.ts',
    testType: 'unit',
    testRole: 'behavior',
    executionEnvironment: { runtime: 'node', confirmedDependencies: [], dependencyCandidates: [] },
  };
  const analyzed = inspectTestFile(
    sample,
    [
      "import { test, expect } from 'vitest';",
      "test.only('focused', () => expect(1).toBe(1));",
      "test('delegates', async () => { await verifyElsewhere(); });",
      "test('windows only', () => { test.skip(process.platform !== 'win32', 'Windows'); expect(1).toBe(1); });",
    ].join('\n'),
  );
  assert.equal(analyzed.caseDeclarations, 3);
  assert.equal(analyzed.focusedDeclarations, 1);
  assert.equal(analyzed.conditionalSkips, 1);
  assert.equal(analyzed.noDirectAssertionCases, 1);
  for (const finding of ['focused-test', 'runtime-conditional-skip', 'no-direct-assertion']) {
    assert.ok(
      analyzed.findings.some((f) => f.id === finding),
      finding,
    );
  }
});

test('AST audit recognizes generated test factories instead of falsely claiming empty files', () => {
  const sample = {
    ...repositoryArchitecture.entries[0],
    path: 'apps/desktop/src/tests/factory.spec.ts',
  };
  const result = inspectTestFile(
    sample,
    [
      'function scenario(name, run) { it(name, async () => { await run(); }); }',
      "scenario('one', async () => { expect(true).toBe(true); });",
      "scenario('two', async () => { expect(false).toBe(false); });",
    ].join('\n'),
  );
  assert.equal(result.caseDeclarations, 0);
  assert.equal(result.factoryCaseCalls, 2);
  assert.ok(result.findings.some((f) => f.id === 'factory-generated-cases'));
  assert.ok(!result.findings.some((f) => f.id === 'test-declaration-unseen'));
});

test('batch audit scans all primary files and preserves human vs automatic evidence distinction', async () => {
  const audit = await buildFullAudit(repositoryRoot, repositoryArchitecture);
  assert.equal(audit.summary.scannedFiles, repositoryInventory.primary.length);
  assert.ok(audit.summary.caseDeclarations > audit.summary.scannedFiles);
  assert.equal(audit.summary.manuallyReviewedSamples, REVIEWED_FILE_SAMPLE_COUNT);
  assert.equal(
    audit.summary.automatedOnly + audit.summary.manuallyReviewedSamples,
    repositoryInventory.primary.length,
  );
  assert.equal(audit.summary.retirementProven, 0);
  assert.equal(audit.issueCounts['focused-test'].files, 0);
  assert.equal(audit.issueCounts['runtime-conditional-skip'].files, 0);
  assert.equal(audit.issueCounts['source-role-ambiguity'].files, 0);
  assert.equal(audit.issueCounts['no-direct-assertion'].files, 0);
  assert.equal(audit.issueCounts['unverified-integration-db'].files, 0);
  assert.equal(audit.issueCounts['unbound-specialized-e2e'].files, 3);
  assert.equal(audit.summary.reviewedResolvedSignals, 19);
  const sync = audit.files.find((f) => f.path === 'apps/web/e2e/sync/goal-sync-regression.spec.ts');
  assert.ok(!sync.findings.some((finding) => finding.id === 'no-direct-assertion'));
  assert.ok(sync.reviewedResolutions.some((finding) => finding.id === 'no-direct-assertion'));
  const windows = audit.files.find((f) => f.path === 'apps/desktop/e2e/workspace-ipc.spec.mts');
  assert.ok(!windows.findings.some((f) => f.id === 'runtime-conditional-skip'));
  assert.ok(windows.reviewedResolutions.some((f) => f.id === 'runtime-conditional-skip'));
  const report = renderHumanReport(audit);
  assert.match(report, /全量自动扫描完成/);
  assert.match(report, new RegExp(`${REVIEWED_FILE_SAMPLE_COUNT} 个文件`));
  assert.match(report, /人工核对/);
  assert.match(report, /安全删除/);
  assert.match(report, /T2/);
  const table = renderFileTable(audit, { finding: 'browser-interaction-simulated', limit: 2 });
  assert.match(table, /\.spec\.ts/);
  assert.match(table, /显示前/);
  assert.doesNotMatch(table, /"primarySuite"\s*:/);
});

test('T2 focused triage partitions flagged files and preserves the 0-retirement invariant', async () => {
  const audit = await buildFullAudit(repositoryRoot, repositoryArchitecture);
  const triage = await buildFocusedTriage(repositoryRoot, audit, repositoryArchitecture);
  assert.equal(triage.summary.scannedPrimary, repositoryInventory.primary.length);
  assert.equal(triage.summary.flaggedPrimary, audit.summary.flaggedFiles);
  assert.equal(triage.summary.reviewedByHumanSample, REVIEWED_FILE_SAMPLE_COUNT);
  assert.equal(triage.summary.flaggedPrimary, 46);
  assert.equal(triage.summary.grouped['needs-gate-decision'], 3);
  assert.equal(triage.summary.grouped['browser-behavior-review'], 43);
  assert.equal(triage.summary.unapprovedRetirement, 0);
  assert.equal(new Set(triage.entries.map((entry) => entry.path)).size, triage.entries.length);
  assert.equal(
    Object.values(triage.summary.grouped).reduce((sum, n) => sum + n, 0),
    triage.summary.flaggedPrimary,
  );
  assert.ok(triage.summary.withP0RiskLink >= 2);
  assert.ok(
    triage.entries.some(
      (entry) =>
        entry.path === 'apps/web/e2e/sync/goal-sync-regression.spec.ts' &&
        entry.disposition === 'needs-gate-decision' &&
        entry.pr === 'not-confirmed',
    ),
  );
  assert.ok(
    !triage.entries.some(
      (entry) => entry.path === 'apps/desktop/src/main/modules/ai/local-agent-knowledge.spec.ts',
    ),
  );
  const report = renderFocusedReport(triage, repositoryArchitecture);
  assert.match(report, /重点复核与工程处理决策/);
  assert.match(report, /完整待处理文件级索引/);
  assert.match(report, /双向同步/);
  assert.match(report, /按源码纠正的分类误报/);
  assert.match(report, /Release 纠错/);
  assert.match(report, /Workspace IPC/);
});

test('focused audit can trace an intra-file delegated assertion without treating it as direct', () => {
  const sample = [
    "import { expect, test } from 'vitest';",
    'function verifyValue() { expect(true).toBe(true); }',
    "test('indirect assertion', async () => { await verifyValue(); });",
    "test('direct assertion', () => { expect(1).toBe(1); });",
  ].join('\n');
  const details = analyzeFocusedSource(sample, 'example.spec.ts');
  assert.equal(details.noDirectCases, 1);
  assert.equal(details.localHelperEvidence.length, 1);
  assert.deepEqual(details.localHelperEvidence[0].helpers, ['verifyValue']);
  assert.equal(details.noDirectExamples[0].title, 'indirect assertion');
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
  const file = 'apps/web/e2e/sync/goal-sync-regression.spec.ts';
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
  const output = await buildFullAudit(repositoryRoot, stale);
  assert.ok(
    output.files
      .find((item) => item.path === file)
      .findings.some((f) => f.id === 'no-direct-assertion'),
  );
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
  const postgres = get('apps/api/src/runtime/business-data-summary.integration.test.ts');
  assert.deepEqual(postgres.executionEnvironment.confirmedDependencies, ['database']);
  assert.deepEqual(postgres.executionEnvironment.dependencyCandidates, []);
});

test('T2 retirement reviewer distinguishes genuine runtime tests from source locks', () => {
  const mixed = inspectRetirementProposal(
    'src/dual-registry.surface.spec.ts',
    [
      "import { expect, it } from 'vitest';",
      "import { scoreIndexedResource } from './knowledge-index-value-helpers';",
      "import { readFileSync } from 'node:fs';",
      "it('runtime', () => {",
      "  expect(scoreIndexedResource({}, '')).toBe(1);",
      "  expect(readFileSync('src/fixture.ts','utf8')).toContain('Residual');",
      '});',
    ].join('\n'),
  );
  assert.equal(mixed.category, 'mixed-runtime-behavior');
  assert.deepEqual(mixed.behaviorInvocations, ['scoreIndexedResource']);
  assert.equal(mixed.assertions, 2);
});

test('T2 reviewer distinguishes independent path invariants and screenshots', () => {
  const paths = inspectRetirementProposal(
    'check.spec.ts',
    [
      "import { existsSync } from 'node:fs';",
      "import { expect, it } from 'vitest';",
      "it('keeps schema removed', () => expect(existsSync('retired.sql')).toBe(false));",
    ].join('\n'),
  );
  assert.equal(paths.category, 'path-or-schema-invariant');
  assert.equal(paths.existenceCalls, 1);
  const sourceOnly = inspectRetirementProposal(
    'source.spec.ts',
    "import { expect, it } from 'vitest'; it('text', () => expect('abc').toContain('a'));",
  );
  assert.equal(sourceOnly.category, 'source-text-candidate');
  const screenshots = inspectRetirementProposal(
    'capture.spec.ts',
    "import { test } from '@playwright/test'; test('capture', async ({page}) => page.screenshot());",
  );
  assert.equal(screenshots.category, 'screenshot-artifact');
});

test('T2 auth precondition audit differentiates UI vs API setup and fixture links', () => {
  const ui = inspectAuthPrecondition(
    'apps/web/e2e/task/task-plan-crud.spec.ts',
    [
      "import { test } from '@playwright/test';",
      "import { registerAndLogin } from '../helpers/testHelpers';",
      'test.beforeEach(async ({page}) => { await registerAndLogin(page); });',
      "test('one',async () => {});",
      "test('two',async () => {});",
    ].join('\n'),
  );
  assert.equal(ui.directUiRegistration, true);
  assert.equal(ui.directApiRegistration, false);
  assert.equal(ui.declaredCases, 2);
  assert.equal(ui.uiRegistrationBeforeEach, 1);

  const api = inspectAuthPrecondition(
    'apps/web/e2e/task/task-plan-crud.spec.ts',
    [
      "import { test } from '@playwright/test';",
      "import { registerAndLogin } from '../helpers/auth-api';",
      'test.beforeEach(async ({page}) => { await registerAndLogin(page); });',
      "test('one',async () => {});",
    ].join('\n'),
  );
  assert.equal(api.directApiRegistration, true);
  assert.equal(api.directUiRegistration, false);
  assert.equal(api.apiRegistrationBeforeEach, 1);
  const indirect = inspectAuthPrecondition(
    'apps/web/e2e/ai/goal-workflow/knowledge.spec.ts',
    [
      "import { test } from '@playwright/test';",
      "import { bootstrapGoalWorkflowSession } from './goal-workflow.fixture';",
      "test('uses fixture',async ({page}) => { await bootstrapGoalWorkflowSession(page); });",
    ].join('\n'),
  );
  assert.equal(indirect.goalWorkflowFixture, true);
  assert.equal(indirect.directUiRegistration, false);
  assert.deepEqual(
    declaredWebSpecs("['authentication/auth-flow.spec.ts', 'goal/goal-crud.spec.ts']"),
    ['authentication/auth-flow.spec.ts', 'goal/goal-crud.spec.ts'],
  );
});

test('T2 retirement scan recognizes production setup calls outside expect and dynamic imports', () => {
  const src = [
    "import { createHandler } from './handler';",
    "import { test, expect } from 'vitest';",
    "test('composition', async () => {",
    '  const handler = createHandler();',
    "  const { createModule } = await import('./module');",
    '  const module = createModule(handler);',
    '  expect(module).toBeDefined();',
    '});',
  ].join('\n');
  const inspected = inspectRetirementProposal('src/integration.surface.spec.ts', src);
  assert.equal(inspected.category, 'mixed-runtime-behavior');
  assert.ok(inspected.behaviorInvocations.includes('createHandler'));
  assert.ok(inspected.dynamicRuntimeImports.includes('./module'));
});

test('T2 PR #602 has one source-hash-verified decision for every proposed deletion', () => {
  const out = execFileSync(process.execPath, ['tools/test-system-v2/t2-review.mjs', '--summary'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const result = JSON.parse(out);
  assert.equal(result.reviewedDeletionFiles, 63);
  assert.equal(result.reviewedPrimarySamples, REVIEWED_FILE_SAMPLE_COUNT);
  assert.equal(result.fullyReadFiles + result.representativeReviewFiles, 63);
  assert.equal(result.remainingUnreviewedDeletionFiles, 0);
  assert.equal(result.counts['mixed-runtime-behavior'], 7);
  assert.equal(result.counts['path-or-schema-invariant'], 13);
  assert.equal(result.reviewCollisions, 63);
  assert.equal(result.testedDeletionFiles, 24);
  assert.equal(result.testedCases, 167);
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
