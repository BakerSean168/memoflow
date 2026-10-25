import { readFileSync } from 'node:fs';

export const UNIT_JOB_IDS = Object.freeze(['unit-1', 'unit-2', 'unit-3']);
export const unitJobName = (id) => `Unit Tests (${UNIT_JOB_IDS.indexOf(id) + 1}/3)`;
const history = JSON.parse(readFileSync(new URL('../unit-test-durations.json', import.meta.url)));
if (
  !Array.isArray(history.ranking) ||
  history.ranking.length === 0 ||
  history.ranking.some(
    (entry) =>
      typeof entry?.project !== 'string' ||
      !Number.isFinite(entry.p50Seconds) ||
      entry.p50Seconds <= 0,
  )
)
  throw new Error('Invalid measured Unit project weights');
const weights = Object.fromEntries(
  history.ranking.map((entry) => [entry.project, entry.p50Seconds]),
);
// Coverage mode runs a different target (test:coverage) for coverage-selected
// projects; that target's cost can differ sharply from `test` (e.g. app-vue's
// coverage config covers only its stores). Measured per-target weights live in
// the optional coverageRanking table and apply only in coverage mode.
const coverageWeights = Object.fromEntries(
  (history.coverageRanking ?? []).map((entry) => [entry.project, entry.p50Seconds]),
);
if (
  Object.values(coverageWeights).some((value) => !Number.isFinite(value) || value <= 0) ||
  Object.keys(coverageWeights).some((project) => !(project in weights))
)
  throw new Error('Invalid measured coverage project weights');
const sorted = Object.values(weights).sort((a, b) => a - b);
const middle = Math.floor(sorted.length / 2);
const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;

/**
 * Fixed three-runner LPT: only the measured dominant project is split by file.
 * Projects listed in `unsplittable` are never file-split: a coverage target's
 * numbers and thresholds are defined over the project's full suite, so a
 * file-sharded coverage run would measure (and gate on) a partial suite.
 */
export function planUnitShards(projects, { unsplittable = [], coverage = false } = {}) {
  if (
    !Array.isArray(projects) ||
    projects.some((p) => typeof p !== 'string' || !/^[@\w][\w@/.-]*$/u.test(p)) ||
    new Set(projects).size !== projects.length ||
    !Array.isArray(unsplittable) ||
    unsplittable.some((p) => typeof p !== 'string')
  ) {
    throw new Error('Unit projects must be unique Nx project names');
  }
  const noSplit = new Set(unsplittable);
  const weightOf = (project) =>
    (coverage ? (coverageWeights[project] ?? weights[project]) : weights[project]) ?? median;
  const tasks = projects
    .filter((project) => project !== 'memoflow')
    .flatMap((project) =>
      project === 'app-vue' && !noSplit.has(project)
        ? [1, 2].map((index) => ({ project, shard: `${index}/2`, seconds: weightOf(project) / 2 }))
        : [{ project, seconds: weightOf(project) }],
    )
    .sort(
      (a, b) =>
        b.seconds - a.seconds ||
        a.project.localeCompare(b.project) ||
        (a.shard ?? '').localeCompare(b.shard ?? ''),
    );
  const bins = UNIT_JOB_IDS.map((id) => ({ id, tasks: [], seconds: 0 }));
  for (const { seconds, ...task } of tasks) {
    // A file-split project only shortens the critical path when its shards run on different jobs.
    const bin = bins
      .filter(
        (candidate) => !task.shard || candidate.tasks.every((t) => t.project !== task.project),
      )
      .reduce((lightest, next) => (next.seconds < lightest.seconds ? next : lightest));
    bin.tasks.push(task);
    bin.seconds += seconds;
  }
  return bins.map(({ id, tasks }) => ({ id, tasks }));
}

export function unitJobEnabled(manifest, id) {
  return (
    manifest.lanes.validate === true &&
    manifest.unitShards.find((shard) => shard.id === id).tasks.length > 0
  );
}
