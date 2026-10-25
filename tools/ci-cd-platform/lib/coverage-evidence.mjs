import { UNIT_JOB_IDS } from './unit-shards.mjs';

/**
 * Coverage evidence verification (merged-coverage design).
 *
 * The coverage lane no longer executes as a separate step: when the
 * manifest selects the coverage lane, the Unit shards run
 * `<project>:test:coverage` in place of `<project>:test` for every project
 * in `scope.coverage`. The gate therefore cannot trust a job result alone —
 * it verifies, per shard task, that a successful coverage attempt was
 * actually recorded for every expected project. A project whose coverage
 * execution silently disappears fails the gate (fail closed), exactly like
 * a missing Web shard receipt.
 */

const COVERAGE_TARGET_SUFFIX = ':test:coverage';

export function coverageTargetProject(attempt) {
  const command = attempt?.command;
  if (!Array.isArray(command)) return null;
  const runIndex = command.indexOf('run');
  if (runIndex < 0) return null;
  const target = command[runIndex + 1];
  if (typeof target !== 'string' || !target.endsWith(COVERAGE_TARGET_SUFFIX)) return null;
  return target.slice(0, -COVERAGE_TARGET_SUFFIX.length);
}

/** Expected coverage executions, derived from the manifest alone. */
export function coverageExpectations(manifest) {
  const coverageProjects = new Set(manifest?.scope?.coverage ?? []);
  const expectations = [];
  for (const shard of manifest?.unitShards ?? []) {
    for (const [index, task] of (shard.tasks ?? []).entries()) {
      if (coverageProjects.has(task.project)) {
        expectations.push({ shardId: shard.id, index, project: task.project });
      }
    }
  }
  return { coverageProjects, expectations };
}

function findReport(reports, { shardId, index }) {
  const name = `${shardId}-${index}`;
  return reports.find(
    (report) => report?.name === name && report?.provenance?.unitShardId === shardId,
  );
}

/**
 * @param {{ manifest: object, reports: object[] | null }} input
 *   reports: parsed test-system-v2 report objects from the Unit shard jobs.
 *   null means the evidence was wired but could not be read (fail closed).
 * @returns {{ required: boolean, failures: string[], coveredProjects: string[],
 *   reports: object[], attemptCount: number, executionMs: number, longestCommandMs: number }}
 */
export function evaluateCoverageEvidence({ manifest, reports }) {
  const empty = {
    coveredProjects: [],
    reports: [],
    attemptCount: 0,
    executionMs: 0,
    longestCommandMs: 0,
  };
  if (manifest?.lanes?.coverage !== true) return { required: false, failures: [], ...empty };
  if (!Array.isArray(reports)) {
    return { required: true, failures: ['coverage:evidence-missing'], ...empty };
  }
  const failures = [];
  const { coverageProjects, expectations } = coverageExpectations(manifest);
  const expectedProjects = new Set(expectations.map(({ project }) => project));
  for (const project of coverageProjects) {
    if (!expectedProjects.has(project)) failures.push(`coverage:${project}:no-unit-task`);
  }
  const matchedReports = [];
  const covered = new Set();
  for (const expectation of expectations) {
    const report = findReport(reports, expectation);
    const attempt = report?.attempts?.find(
      (candidate) => coverageTargetProject(candidate) === expectation.project,
    );
    if (!report || !attempt) {
      failures.push(`coverage:${expectation.project}:missing-attempt`);
      continue;
    }
    if (report.result !== 'success' || attempt.exitCode !== 0) {
      failures.push(`coverage:${expectation.project}:attempt-failed`);
      continue;
    }
    covered.add(expectation.project);
    if (!matchedReports.includes(report)) matchedReports.push(report);
  }
  // A coverage attempt for a project the manifest did not select means the
  // executor drifted from the plan; treat it like any other scope drift.
  for (const report of reports) {
    if (!UNIT_JOB_IDS.includes(report?.provenance?.unitShardId)) continue;
    for (const attempt of report?.attempts ?? []) {
      const project = coverageTargetProject(attempt);
      if (project && !coverageProjects.has(project)) {
        failures.push(`coverage:${project}:unexpected-attempt`);
      }
    }
  }
  const coverageAttempts = matchedReports.flatMap((report) =>
    (report.attempts ?? []).filter((attempt) => coverageTargetProject(attempt)),
  );
  return {
    required: true,
    failures: [...new Set(failures)],
    coveredProjects: [...covered].sort(),
    reports: matchedReports,
    attemptCount: coverageAttempts.length,
    executionMs: coverageAttempts.reduce((total, attempt) => total + (attempt.durationMs ?? 0), 0),
    longestCommandMs: Math.max(0, ...coverageAttempts.map((attempt) => attempt.durationMs ?? 0)),
  };
}
