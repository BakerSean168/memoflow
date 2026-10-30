import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  TEST_TYPES,
  TEST_ROLES,
  countBy,
  inferVerificationDimensions,
} from './architecture-taxonomy.mjs';

const REVIEW_DECISIONS = new Set([
  'retain',
  'supplement',
  'browser-candidate',
  'rework-source-assertions',
]);
const DEPENDENCIES = new Set(['database', 'external-service']);
const RESOLVABLE_FINDINGS = new Set([
  'no-direct-assertion',
  'runtime-conditional-skip',
  'factory-generated-cases',
  'source-role-ambiguity',
]);
const SHA256 = /^[a-f0-9]{64}$/u;

export async function loadReviewRegistry(root) {
  return JSON.parse(
    await fs.readFile(
      path.resolve(root, 'tools/test-system-v2/architecture-review-registry.json'),
      'utf8',
    ),
  );
}

export function reviewFingerprint(source) {
  return createHash('sha256').update(source).digest('hex');
}

export function validateReviewRegistry(registry, entries, storyRows) {
  const issues = [];
  if (registry?.version !== 1) issues.push('unsupported-review-registry-version');
  if (!Array.isArray(registry?.reviews) || registry.reviews.length === 0) {
    issues.push('review-registry-empty');
  }
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const storyMap = new Map(storyRows.map((story) => [story.path, story]));
  const seen = new Set();
  for (const item of registry?.reviews ?? []) {
    if (!item.path || seen.has(item.path))
      issues.push('review-duplicate-or-empty-path:' + item.path);
    seen.add(item.path);
    if (!byPath.has(item.path)) issues.push('review-path-not-primary:' + item.path);
    if (item.reviewScope !== 'representative-assertions') {
      issues.push('review-invalid-scope:' + item.path);
    }
    if (
      !item.classification ||
      typeof item.classification !== 'object' ||
      !TEST_ROLES.includes(item.classification.testRole) ||
      (item.classification.testType !== null && !TEST_TYPES.includes(item.classification.testType))
    ) {
      issues.push('review-invalid-classification:' + item.path);
    } else if (
      (item.classification.testType === null) !==
      ['governance', 'source-constraint'].includes(item.classification.testRole)
    ) {
      issues.push('review-role-type-mismatch:' + item.path);
    }
    if (!REVIEW_DECISIONS.has(item.decision)) issues.push('review-invalid-decision:' + item.path);
    if (
      !item.behavior ||
      !item.reason ||
      !Array.isArray(item.assertionEvidence) ||
      !item.assertionEvidence.length ||
      item.assertionEvidence.some((s) => typeof s !== 'string' || !s.trim())
    ) {
      issues.push('review-missing-assertion-evidence:' + item.path);
    }
    if (!SHA256.test(item.sourceSha256 ?? ''))
      issues.push('review-missing-source-digest:' + item.path);
    const resolved = item.resolvedFindings ?? [];
    if (
      !Array.isArray(resolved) ||
      resolved.some(
        (finding) =>
          !finding ||
          !RESOLVABLE_FINDINGS.has(finding.id) ||
          !['expected-behavior', 'static-false-positive'].includes(finding.disposition) ||
          !finding.evidence?.trim(),
      )
    ) {
      issues.push('review-invalid-finding-resolution:' + item.path);
    }
    if (Array.isArray(resolved) && new Set(resolved.map((f) => f.id)).size !== resolved.length) {
      issues.push('review-duplicate-finding-resolution:' + item.path);
    }
    if (
      !Array.isArray(item.confirmedDependencies ?? []) ||
      item.confirmedDependencies?.some((e) => !DEPENDENCIES.has(e))
    ) {
      issues.push('review-invalid-dependency:' + item.path);
    }
    if (
      !item.replacement ||
      item.replacement.status !== 'none-verified' ||
      item.replacement.testFiles?.length
    ) {
      issues.push('review-unverified-retirement:' + item.path);
    }
  }
  const seenStories = new Set();
  for (const item of registry?.storyReviews ?? []) {
    if (!item.path || seenStories.has(item.path))
      issues.push('duplicate-review-story:' + item.path);
    seenStories.add(item.path);
    if (!storyMap.has(item.path)) issues.push('review-story-not-found:' + item.path);
    if (!SHA256.test(item.sourceSha256 ?? ''))
      issues.push('review-story-missing-source-digest:' + item.path);
    if (
      !Array.isArray(item.cases) ||
      !item.cases.length ||
      !item.behavior ||
      item.reviewScope !== 'all-play-functions' ||
      item.decision !== 'retain'
    ) {
      issues.push('review-invalid-story:' + item.path);
    }
  }
  const seenOverlap = new Set();
  for (const item of registry?.overlapGroups ?? []) {
    if (!item.id || seenOverlap.has(item.id)) issues.push('review-duplicate-overlap:' + item.id);
    seenOverlap.add(item.id);
    if (
      !['complementary', 'coverage-gap', 'candidate-overlap'].includes(item.assessment) ||
      !item.reason ||
      item.retirementDecision !== 'blocked-no-equivalent-replacement' ||
      !Array.isArray(item.paths) ||
      item.paths.length < 2 ||
      new Set(item.paths).size !== item.paths.length
    ) {
      issues.push('review-invalid-overlap:' + item.id);
    }
    for (const file of item.paths ?? []) {
      if (!byPath.has(file) && !storyMap.has(file)) {
        issues.push('review-overlap-path-missing:' + item.id + ':' + file);
      }
    }
  }
  return {
    issues: issues.sort(),
    reviewsByPath: new Map((registry?.reviews ?? []).map((r) => [r.path, r])),
    storiesByPath: new Map((registry?.storyReviews ?? []).map((r) => [r.path, r])),
  };
}

export function applySemanticReview(entry, source, review, warnings) {
  if (!review) return entry;
  if (reviewFingerprint(source) !== review.sourceSha256) {
    warnings.push('stale-review-not-applied:' + entry.path);
    return { ...entry, reviewStatus: 'stale-review', reviewDecision: null };
  }
  const { testType, testRole } = review.classification;
  const env = { ...entry.executionEnvironment };
  if (Object.hasOwn(review, 'confirmedDependencies')) {
    env.dependencyCandidates = env.dependencyCandidates.filter(
      (item) => !review.confirmedDependencies.includes(item.environment),
    );
    env.confirmedDependencies = review.confirmedDependencies;
    if (review.confirmedDependencies.length === 0) env.dependencyCandidates = [];
  }
  const inferred = {
    testType: entry.testType,
    testRole: entry.testRole,
    classificationEvidence: entry.classificationEvidence,
  };
  const dimensions = inferVerificationDimensions(source, testType, testRole);
  const correctedBoundary =
    testRole === 'source-constraint'
      ? 'source-inspection'
      : entry.boundary === 'web-application' &&
          testType === 'component' &&
          env.runtime === 'real-browser'
        ? 'browser-component-fixture'
        : entry.boundary === 'source-inspection' && testType === 'unit'
          ? 'in-process'
          : entry.boundary === 'source-inspection' && testType === 'contract'
            ? 'in-process-protocol'
            : entry.boundary === 'source-inspection' && testType === 'integration'
              ? 'module-or-database'
              : entry.boundary === 'in-process-protocol' && testType === 'unit'
                ? 'in-process'
                : entry.boundary;
  return {
    ...entry,
    testType,
    testRole,
    boundary: correctedBoundary,
    verificationDimensions: dimensions.dimensions,
    verificationEvidence: dimensions.evidence,
    evaluationMode: dimensions.evaluationMode,
    inferredBeforeReview: inferred,
    classificationEvidence: 'sampled-assertion-review',
    classificationStatus: 'reviewed-primary-intent-not-all-assertions',
    reviewStatus: 'reviewed-sample',
    reviewDecision: review.decision,
    reviewedBehavior: review.behavior,
    reviewedAssertionEvidence: review.assertionEvidence,
    reviewedReason: review.reason,
    resolvedFindings: review.resolvedFindings ?? [],
    executionEnvironment: env,
    ...(testRole === 'source-constraint'
      ? { purpose: 'source-shape-regression' }
      : testType === 'component' && env.runtime === 'real-browser'
        ? { purpose: 'browser-component-or-visual-fixture' }
        : testType === 'unit'
          ? { purpose: 'local-state-or-domain-rule' }
          : testType === 'contract'
            ? { purpose: 'api-or-schema-compatibility' }
            : testType === 'integration'
              ? { purpose: 'collaborating-modules' }
              : {}),
  };
}

export function annotateStoryReview(story, source, review, warnings) {
  if (!review) return story;
  if (reviewFingerprint(source) !== review.sourceSha256) {
    warnings.push('stale-story-review-not-applied:' + story.path);
    return { ...story, reviewStatus: 'stale-review' };
  }
  for (const name of review.cases) {
    if (
      !/^[A-Za-z_$][\w$]*$/u.test(name) ||
      !new RegExp('export\\s+const\\s+' + name + '\\b', 'u').test(source)
    ) {
      warnings.push('review-story-case-changed:' + story.path + ':' + name);
    }
  }
  return {
    ...story,
    reviewStatus: 'reviewed-sample',
    reviewDecision: review.decision,
    reviewedCases: review.cases,
    reviewedBehavior: review.behavior,
  };
}

export function summarizeReviews(entries, stories, registry, warnings) {
  const reviewed = entries.filter((entry) => entry.reviewStatus === 'reviewed-sample');
  return {
    reviewedPrimaryFiles: reviewed.length,
    pendingPrimaryFiles: entries.length - reviewed.length,
    byReviewDecision: countBy(reviewed, (entry) => entry.reviewDecision),
    reviewedStoryFiles: stories.filter((story) => story.reviewStatus === 'reviewed-sample').length,
    overlapGroups: registry.overlapGroups?.length ?? 0,
    retirementApproved: 0,
    warnings: warnings.length,
  };
}
