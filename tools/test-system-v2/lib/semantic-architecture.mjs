import { promises as fs } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import {
  ARCHITECTURE_VERSION,
  TEST_TYPES,
  TEST_ROLES,
  VERIFICATION_DIMENSIONS,
  EXECUTION_ENVIRONMENTS,
  EXECUTION_PHASES,
  countBy,
  inferVerificationDimensions,
  inferEnvironment,
} from './architecture-taxonomy.mjs';
import { loadExecutionEvidence, determineExecutionPhases } from './architecture-execution.mjs';
import {
  loadReviewRegistry,
  validateReviewRegistry,
  applySemanticReview,
  annotateStoryReview,
  summarizeReviews,
} from './architecture-review.mjs';

export {
  ARCHITECTURE_VERSION,
  TEST_TYPES,
  TEST_ROLES,
  VERIFICATION_DIMENSIONS,
  EXECUTION_ENVIRONMENTS,
  EXECUTION_PHASES,
};

const SUITE_TYPES = {
  integration: ['integration', 'module-or-database'],
  smoke: ['integration', 'http-assembly'],
  'boundary-ipc': ['boundary', 'electron-ipc'],
  'boundary-main': ['boundary', 'electron-main'],
  e2e: ['e2e', 'full-application'],
  perf: ['performance', 'measurement'],
  governance: [null, 'repository-rules'],
};

function mapDomain(file) {
  const patterns = [
    /^packages\/app-vue\/src\/modules\/([^/]+)\//u,
    /^apps\/api\/src\/modules\/([^/]+)\//u,
    /^apps\/desktop\/src\/main\/modules\/([^/]+)\//u,
    /^apps\/web\/e2e\/([^/]+)\//u,
    /^apps\/web\/src\/(auth)\//u,
    /^packages\/([^/]+)\//u,
    /^tools\/([^/]+)\//u,
    /^apps\/([^/]+)\//u,
  ];
  for (const pattern of patterns) {
    const match = file.match(pattern);
    if (match) return match[1];
  }
  return 'unclassified';
}

function extractCaseHints(source) {
  const hints = [];
  const regex = /\b(?:it|test)(?:\.(?:skip|only|todo))?\s*\(\s*(['"])(.{4,160}?)\1/gu;
  for (const match of source.matchAll(regex)) {
    if (!hints.includes(match[2])) hints.push(match[2]);
    if (hints.length === 3) break;
  }
  return hints;
}

/**
 * Derive orthogonal semantic metadata. Existing primarySuite/collectors remain
 * the only executable ownership contract. No heuristics grant CI coverage.
 */
export function classifySemanticTest(entry, source, context = {}) {
  if (!entry?.path || !entry.primarySuite) {
    throw new Error('Semantic classification requires a primary-owned test file');
  }
  const file = entry.path;
  const suite = entry.primarySuite;
  let testType;
  let boundary;
  let classificationEvidence = 'primary-suite';
  let testRole = 'behavior';
  const flags = [];
  if (Object.hasOwn(SUITE_TYPES, suite)) {
    [testType, boundary] = SUITE_TYPES[suite];
    if (suite === 'governance') testRole = 'governance';
    if (suite === 'smoke') testRole = 'smoke';
    if (suite === 'e2e') {
      boundary = file.startsWith('apps/desktop/') ? 'desktop-application' : 'web-application';
    }
    if (
      suite === 'integration' &&
      /\b(?:PrismaClient|postgres|pg\.|testDatabase|testDb)\b/iu.test(source)
    ) {
      boundary = 'database';
      classificationEvidence = 'primary-suite-and-source-signal';
    }
  } else if (suite === 'unit') {
    const readsSources =
      /\b(?:readFileSync|readFile|readdirSync)\s*\(/u.test(source) &&
      /(?:\.vue|\.tsx?|source|__dirname)/u.test(source);
    const textAssertions = /\b(?:toContain|toMatch|\.includes|assert\.match)\b/u.test(source);
    const mountsVue =
      /@vue\/test-utils|@testing-library\/vue/u.test(source) &&
      /\b(?:mount|shallowMount|render)\s*\(/u.test(source);
    const namedContract = /(?:^|[/. -])(?:contract|schema|dto|ipc-envelope)(?:[/. -]|$)/iu.test(
      file,
    );
    if (readsSources && textAssertions && !mountsVue) {
      // Structural source checks are not product Unit tests and are not
      // a new executable test type; they form a review/governance role.
      testType = null;
      boundary = 'source-inspection';
      testRole = 'source-constraint';
      classificationEvidence = 'source-scan-heuristic';
      flags.push('verify-source-lock-belongs-in-governance');
    } else if (mountsVue) {
      testType = 'component';
      boundary = 'simulated-dom';
      classificationEvidence = 'vue-mount-signal';
    } else if (namedContract || file.startsWith('packages/contracts/')) {
      testType = 'contract';
      boundary = 'in-process-protocol';
      classificationEvidence = 'path-convention';
    } else {
      testType = 'unit';
      boundary = 'in-process';
      classificationEvidence = 'fallback-unreviewed';
    }
  } else {
    throw new Error('Unrecognized primary suite for ' + file + ': ' + suite);
  }

  const collector = context.executionEvidence?.collectors.get(
    entry.e2eOwnership?.primaryCollector ?? entry.collectors?.[0],
  );
  const env = inferEnvironment(entry, source, collector);
  if (testType === 'component' && env.runtime !== 'real-browser') {
    flags.push('real-browser-interactions-not-proven');
  }
  const verification = inferVerificationDimensions(source, testType, testRole);
  const phases = context.executionEvidence
    ? determineExecutionPhases(entry, context.executionEvidence)
    : Object.fromEntries(
        EXECUTION_PHASES.map((phase) => [
          phase,
          { status: 'not-confirmed', basis: 'no topology evidence supplied' },
        ]),
      );
  const declaredCollector = entry.e2eOwnership?.primaryCollector ?? entry.collectors?.[0] ?? null;
  return {
    path: file,
    primarySuite: suite,
    collectors: entry.collectors,
    testType,
    testRole,
    boundary,
    domain: mapDomain(file),
    purpose:
      testRole === 'source-constraint'
        ? 'source-shape-regression'
        : testRole === 'governance'
          ? 'test-or-repository-governance'
          : testRole === 'smoke'
            ? 'assembled-http-surface'
            : testType === 'performance'
              ? 'performance-characteristic'
              : testType === 'e2e'
                ? 'cross-module-user-flow'
                : testType === 'component'
                  ? 'rendered-component-behavior'
                  : testType === 'contract'
                    ? 'api-or-schema-compatibility'
                    : testType === 'boundary'
                      ? 'process-boundary-behavior'
                      : testType === 'integration'
                        ? 'collaborating-modules'
                        : 'local-state-or-domain-rule',
    classificationEvidence,
    classificationStatus: 'inferred-not-assertion-reviewed',
    testCaseHints: extractCaseHints(source),
    verificationDimensions: verification.dimensions,
    verificationEvidence: verification.evidence,
    evaluationMode: verification.evaluationMode,
    executionEnvironment: env,
    executionPhases: phases,
    flags,
    // Keep legacy execution metadata for compatibility with the T1 risk index.
    execution: {
      runner: env.runner,
      environmentDirective: env.directive,
      primaryCollector: declaredCollector,
      e2eRole: entry.e2eOwnership?.role ?? null,
      e2eLane: collector?.e2eOwnership?.lane ?? null,
    },
  };
}

async function mapWithConcurrency(items, concurrency, callback) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(
    Array.from({ length: Math.min(items.length, concurrency) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await callback(items[index]);
      }
    }),
  );
  return results;
}

function validateVocabulary(items, valid, name, riskId, issues) {
  if (!Array.isArray(items)) {
    issues.push('invalid-' + name + '-list:' + riskId);
    return [];
  }
  for (const item of items) {
    if (!valid.includes(item)) issues.push('unknown-' + name + ':' + riskId + ':' + item);
  }
  if (new Set(items).size !== items.length) issues.push('duplicate-' + name + ':' + riskId);
  return items;
}

export function assessRiskMatrix(manifest, entries, collectors, stories = []) {
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const collectorById = new Map(collectors.map((collector) => [collector.id, collector]));
  const storyByPath = new Map(stories.map((story) => [story.path, story]));
  const issues = [];
  const seenRiskIds = new Set();
  const scenarios = [];
  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length === 0) {
    issues.push('risk-matrix-is-empty');
  }
  for (const scenario of manifest.scenarios ?? []) {
    if (!scenario.id || seenRiskIds.has(scenario.id))
      issues.push('duplicate-or-empty-risk-id:' + scenario.id);
    seenRiskIds.add(scenario.id);
    if (!['P0', 'P1', 'P2'].includes(scenario.severity))
      issues.push('invalid-severity:' + scenario.id);
    if (!scenario.domain || !scenario.behavior || !scenario.failureImpact)
      issues.push('missing-risk-description:' + scenario.id);
    const expectedTypes = validateVocabulary(
      scenario.expectedTypes,
      TEST_TYPES,
      'test-type',
      scenario.id,
      issues,
    );
    const expectedDimensions = validateVocabulary(
      scenario.expectedDimensions,
      VERIFICATION_DIMENSIONS,
      'dimension',
      scenario.id,
      issues,
    );
    const expectedEnvironments = validateVocabulary(
      scenario.expectedEnvironments ?? [],
      EXECUTION_ENVIRONMENTS,
      'environment',
      scenario.id,
      issues,
    );
    const expectedRoles = validateVocabulary(
      scenario.expectedRoles ?? [],
      TEST_ROLES,
      'role',
      scenario.id,
      issues,
    );
    const desiredPhases = validateVocabulary(
      scenario.desiredPhases ?? [],
      EXECUTION_PHASES,
      'phase',
      scenario.id,
      issues,
    );
    if (!expectedTypes.length && !expectedRoles.length)
      issues.push('missing-expected-types-and-roles:' + scenario.id);
    if (!expectedDimensions.length) issues.push('missing-expected-dimensions:' + scenario.id);
    if (!Array.isArray(scenario.evidence) || scenario.evidence.length === 0)
      issues.push('missing-risk-evidence:' + scenario.id);
    const seenEvidence = new Set();
    const evidence = (scenario.evidence ?? []).map((sample) => {
      if (seenEvidence.has(sample.path))
        issues.push('duplicate-evidence:' + scenario.id + ':' + sample.path);
      seenEvidence.add(sample.path);
      const entry = entryByPath.get(sample.path);
      if (!entry)
        issues.push('evidence-not-in-primary-inventory:' + scenario.id + ':' + sample.path);
      if (!['assertion-reviewed', 'candidate'].includes(sample.review))
        issues.push('invalid-review-status:' + scenario.id + ':' + sample.path);
      if (!sample.behaviorClaim)
        issues.push('missing-behavior-claim:' + scenario.id + ':' + sample.path);
      const verifiedDimensions = validateVocabulary(
        sample.verifiedDimensions ?? [],
        VERIFICATION_DIMENSIONS,
        'verified-dimension',
        scenario.id + ':' + sample.path,
        issues,
      );
      if (verifiedDimensions.length && sample.review !== 'assertion-reviewed') {
        issues.push('unreviewed-dimension-claim:' + scenario.id + ':' + sample.path);
      }
      const staleReview = entry?.reviewStatus === 'stale-review';
      const primary = entry?.execution?.primaryCollector;
      const collector = collectorById.get(primary);
      return {
        ...sample,
        review: staleReview ? 'candidate' : sample.review,
        verifiedDimensions: staleReview ? [] : verifiedDimensions,
        testType: entry?.testType ?? null,
        testRole: entry?.testRole ?? null,
        primarySuite: entry?.primarySuite ?? null,
        dimensionCandidates: entry?.verificationDimensions ?? [],
        runtimeEnvironment: entry?.executionEnvironment?.runtime ?? null,
        dependencyCandidates: entry?.executionEnvironment?.dependencyCandidates ?? [],
        confirmedDependencies: entry?.executionEnvironment?.confirmedDependencies ?? [],
        classificationReviewStatus: entry?.reviewStatus ?? 'pending',
        executionPhases: entry?.executionPhases ?? {},
        e2eLane: collector?.e2eOwnership?.lane ?? null,
        declaredAutomation: (collector?.e2eOwnership?.automation?.length ?? 0) > 0,
      };
    });
    const relatedStories = (scenario.relatedStories ?? []).map((item) => {
      const story = storyByPath.get(item.path);
      if (!story) issues.push('risk-story-not-found:' + scenario.id + ':' + item.path);
      if (!item.behaviorClaim || !['assertion-reviewed', 'candidate'].includes(item.review)) {
        issues.push('risk-story-invalid-claim:' + scenario.id + ':' + item.path);
      }
      return {
        ...item,
        storyReviewStatus: story?.reviewStatus ?? 'pending',
        review: story?.reviewStatus === 'stale-review' ? 'candidate' : item.review,
        executionStatus: story?.executionStatus ?? 'not-verified',
      };
    });
    const presentTypes = new Set(evidence.map((item) => item.testType));
    const presentRoles = new Set(evidence.map((item) => item.testRole));
    const presentDimensions = new Set(
      evidence.flatMap((item) => [...item.dimensionCandidates, ...item.verifiedDimensions]),
    );
    const reviewedDimensions = new Set(evidence.flatMap((item) => item.verifiedDimensions));
    const presentEnvironments = new Set(
      evidence.flatMap((item) => [
        item.runtimeEnvironment,
        ...item.dependencyCandidates.map((candidate) => candidate.environment),
        ...item.confirmedDependencies,
      ]),
    );
    const declaredPhases = new Set(
      evidence.flatMap((item) =>
        EXECUTION_PHASES.filter(
          (phase) =>
            item.executionPhases?.[phase]?.status === 'available' ||
            item.executionPhases?.[phase]?.status === 'conditional',
        ),
      ),
    );
    const missingExpectedTypes = expectedTypes.filter((type) => !presentTypes.has(type));
    const missingExpectedRoles = expectedRoles.filter((role) => !presentRoles.has(role));
    const missingExpectedDimensions = expectedDimensions.filter(
      (dim) => !presentDimensions.has(dim),
    );
    const unreviewedExpectedDimensions = expectedDimensions.filter(
      (dim) => presentDimensions.has(dim) && !reviewedDimensions.has(dim),
    );
    const missingExpectedEnvironments = expectedEnvironments.filter(
      (env) => !presentEnvironments.has(env),
    );
    const missingDesiredPhases = desiredPhases.filter((phase) => !declaredPhases.has(phase));
    const knownGaps = scenario.knownGaps ?? [];
    if (!Array.isArray(knownGaps)) issues.push('invalid-known-gaps:' + scenario.id);
    scenarios.push({
      id: scenario.id,
      severity: scenario.severity,
      domain: scenario.domain,
      behavior: scenario.behavior,
      failureImpact: scenario.failureImpact,
      expectedTypes,
      expectedDimensions,
      expectedEnvironments,
      expectedRoles,
      desiredPhases,
      missingExpectedTypes,
      missingExpectedRoles,
      missingExpectedDimensions,
      unreviewedExpectedDimensions,
      missingExpectedEnvironments,
      missingDesiredPhases,
      evidence,
      relatedStories,
      knownGaps,
      // A declared phase is only eligible for selection, never an execution receipt.
      assessment:
        missingExpectedTypes.length ||
        missingExpectedRoles.length ||
        missingExpectedDimensions.length ||
        missingExpectedEnvironments.length ||
        missingDesiredPhases.length ||
        knownGaps.length
          ? 'explicit-gap'
          : evidence.some((sample) => sample.review !== 'assertion-reviewed') ||
              unreviewedExpectedDimensions.length
            ? 'candidate-mapping'
            : 'sampled-evidence-only',
    });
  }
  return { scenarios, issues };
}

export async function buildTestArchitecture(root, options = {}) {
  const inventory =
    options.inventory ??
    JSON.parse(
      await fs.readFile(path.resolve(root, 'tools/test-system-v2/test-inventory.json'), 'utf8'),
    );
  const matrix =
    options.matrix ??
    JSON.parse(
      await fs.readFile(
        path.resolve(root, 'tools/test-system-v2/behavior-risk-matrix.json'),
        'utf8',
      ),
    );
  const reviewRegistry = options.reviewRegistry ?? (await loadReviewRegistry(root));
  const issues = [];
  const reviewWarnings = [];
  if (inventory.version !== 3) issues.push('unsupported-primary-inventory-version');
  if (matrix.version !== 2) issues.push('unsupported-risk-matrix-version');
  if (
    (inventory.missing?.length ?? 0) +
    (inventory.duplicate?.length ?? 0) +
    (inventory.unexpected?.length ?? 0) +
    (inventory.measurementOnly?.length ?? 0)
  ) {
    issues.push('primary-inventory-has-ownership-errors');
  }
  const executionEvidence =
    options.executionEvidence ?? (await loadExecutionEvidence(root, inventory));
  const sourceByPath = new Map();
  const entries = await mapWithConcurrency(inventory.primary ?? [], 20, async (entry) => {
    try {
      const source = await fs.readFile(path.resolve(root, entry.path), 'utf8');
      sourceByPath.set(entry.path, source);
      return classifySemanticTest(entry, source, { executionEvidence });
    } catch (error) {
      issues.push('cannot-classify-primary-test:' + entry.path + ':' + error.message);
      return null;
    }
  });
  const filtered = entries.filter(Boolean);
  const stories = (
    await fg(
      [
        'apps/**/*.{stories,story}.{ts,tsx,js,jsx}',
        'packages/**/*.{stories,story}.{ts,tsx,js,jsx}',
      ],
      { cwd: root, ignore: ['**/node_modules/**', '**/dist/**'] },
    )
  ).sort();
  const storySources = new Map();
  const storyRows = await mapWithConcurrency(stories, 20, async (file) => {
    const source = await fs.readFile(path.resolve(root, file), 'utf8');
    storySources.set(file, source);
    const hasPlayFunction = /\bplay\s*:\s*(?:async\s*)?(?:\(|function\b)/u.test(source);
    return {
      path: file,
      domain: mapDomain(file),
      hasPlayFunction,
      // Storybook is a scenario source: no inferred CI/behavioral coverage.
      verificationDimensionCandidates: inferVerificationDimensions(
        source,
        hasPlayFunction ? 'component' : null,
        'behavior',
      ).dimensions,
      executionStatus: 'storybook-scenario-ci-not-verified',
    };
  });
  const reviewIndex = validateReviewRegistry(reviewRegistry, filtered, storyRows);
  issues.push(...reviewIndex.issues);
  const reviewedEntries = filtered.map((entry) =>
    applySemanticReview(
      entry,
      sourceByPath.get(entry.path),
      reviewIndex.reviewsByPath.get(entry.path),
      reviewWarnings,
    ),
  );
  const reviewedStories = storyRows.map((story) =>
    annotateStoryReview(
      story,
      storySources.get(story.path),
      reviewIndex.storiesByPath.get(story.path),
      reviewWarnings,
    ),
  );
  const riskMatrix = assessRiskMatrix(
    matrix,
    reviewedEntries,
    inventory.collectors ?? [],
    reviewedStories,
  );
  issues.push(...riskMatrix.issues);
  if (filtered.length !== inventory.primary?.length)
    issues.push('primary-semantic-inventory-incomplete');
  if (new Set(filtered.map((row) => row.path)).size !== filtered.length)
    issues.push('duplicate-primary-semantic-entry');
  return {
    version: ARCHITECTURE_VERSION,
    sourceInventoryVersion: inventory.version,
    taxonomy: {
      testTypes: TEST_TYPES,
      verificationDimensions: VERIFICATION_DIMENSIONS,
      executionEnvironments: EXECUTION_ENVIRONMENTS,
      executionPhases: EXECUTION_PHASES,
      testRoles: TEST_ROLES,
    },
    summary: {
      primaryFiles: filtered.length,
      byPrimarySuite: inventory.counts,
      byTestType: countBy(reviewedEntries, (entry) => entry.testType),
      byTestRole: countBy(reviewedEntries, (entry) => entry.testRole),
      byBoundary: countBy(reviewedEntries, (entry) => entry.boundary),
      byDomain: countBy(reviewedEntries, (entry) => entry.domain),
      byVerificationDimensionCandidates: countBy(
        reviewedEntries,
        (entry) => entry.verificationDimensions,
      ),
      byRuntimeEnvironment: countBy(reviewedEntries, (entry) => entry.executionEnvironment.runtime),
      byEnvironmentDependencyCandidates: countBy(reviewedEntries, (entry) =>
        entry.executionEnvironment.dependencyCandidates.map((value) => value.environment),
      ),
      byConfirmedDependencies: countBy(
        reviewedEntries,
        (entry) => entry.executionEnvironment.confirmedDependencies,
      ),
      byDeclaredPhases: Object.fromEntries(
        EXECUTION_PHASES.map((phase) => [
          phase,
          countBy(reviewedEntries, (entry) => entry.executionPhases[phase].status),
        ]),
      ),
      sourceInspectionCandidates: reviewedEntries.filter(
        (entry) => entry.testRole === 'source-constraint',
      ).length,
      stories: storyRows.length,
      storiesWithPlayFunction: storyRows.filter((story) => story.hasPlayFunction).length,
      riskScenarios: riskMatrix.scenarios.length,
      riskScenariosWithExplicitGaps: riskMatrix.scenarios.filter(
        (row) => row.assessment === 'explicit-gap',
      ).length,
      unreviewedSemanticFiles: reviewedEntries.filter(
        (entry) => entry.reviewStatus !== 'reviewed-sample',
      ).length,
      review: summarizeReviews(reviewedEntries, reviewedStories, reviewRegistry, reviewWarnings),
    },
    entries: reviewedEntries,
    stories: reviewedStories,
    riskMatrix: riskMatrix.scenarios,
    overlapGroups: reviewRegistry.overlapGroups ?? [],
    reviewWarnings,
    issues: issues.sort(),
  };
}
