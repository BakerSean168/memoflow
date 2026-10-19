/* eslint-disable @nx/enforce-module-boundaries -- planner consumes the Web-owned canonical spec list */
import { WEB_FLOW_SPECS } from '../../../apps/web/web-flow-specs.mjs';
import { medianDuration, planShards } from './shard-balance.mjs';

// Wall budget includes the measured fixed setup cost. Keep all tuning here.
export const WEB_SHARD_POLICY = Object.freeze({
  targetPerShardMs: 397_000,
  setupMs: 97_000,
  maxShards: 8,
  defaultShards: 4,
});

export function selectWebSpecs({ enabled, full, files }) {
  if (!enabled) return { specs: [], fallback: false };
  if (full) return { specs: [...WEB_FLOW_SPECS], fallback: false };
  const canonical = new Set(WEB_FLOW_SPECS.map((spec) => `apps/web/e2e/${spec}`));
  // Only exact canonical spec edits prove a narrower scope. Shared imports,
  // helpers, deleted/renamed specs and unknown input conservatively run all.
  if (!Array.isArray(files) || files.length === 0 || files.some((file) => !canonical.has(file))) {
    return { specs: [...WEB_FLOW_SPECS], fallback: true };
  }
  return {
    specs: [...new Set(files.map((file) => file.slice('apps/web/e2e/'.length)))].sort(),
    fallback: false,
  };
}

export function planWebShards({
  specs,
  fallback = false,
  durations = {},
  policy = WEB_SHARD_POLICY,
}) {
  for (const key of ['targetPerShardMs', 'setupMs', 'maxShards', 'defaultShards']) {
    if (!Number.isSafeInteger(policy[key]) || policy[key] < 1)
      throw new Error(`Invalid Web shard policy: ${key}`);
  }
  if (policy.targetPerShardMs <= policy.setupMs || policy.defaultShards > policy.maxShards) {
    throw new Error('Invalid Web shard budget');
  }
  if (
    !Array.isArray(specs) ||
    specs.some((spec) => !WEB_FLOW_SPECS.includes(spec)) ||
    new Set(specs).size !== specs.length
  ) {
    throw new Error('Invalid selected Web specs');
  }
  const selected = fallback ? [...WEB_FLOW_SPECS] : [...specs].sort();
  const valid = (value) => Number.isFinite(value) && value > 0;
  const defaultMs = medianDuration(Object.values(durations).map((entry) => entry?.durationMs));
  const weights = Object.fromEntries(
    selected.map((spec) => [
      spec,
      {
        durationMs: valid(durations[spec]?.durationMs) ? durations[spec].durationMs : defaultMs,
      },
    ]),
  );
  const estimatedTotalMs = Object.values(weights).reduce(
    (total, entry) => total + entry.durationMs,
    0,
  );
  const shardCount =
    selected.length === 0
      ? 0
      : fallback
        ? policy.defaultShards
        : Math.min(
            policy.maxShards,
            selected.length,
            Math.max(1, Math.ceil(estimatedTotalMs / (policy.targetPerShardMs - policy.setupMs))),
          );
  const shards =
    shardCount === 0
      ? []
      : planShards({ specs: selected, durations: weights, shardCount }).shards.map(
          (shard, index) => ({
            id: `${index + 1}/${shardCount}`,
            specs: shard.specs,
            estimatedMs: shard.totalMs,
          }),
        );
  return { specs: selected, fallback, estimatedTotalMs, shardCount, shards };
}

// A file counts only if at least one test actually ran; listing/skipping a file
// is insufficient. Preserve unexpected files so the gate can reject them.
export function executedWebSpecs(report) {
  const files = new Set();
  function visit(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        if (
          (spec.tests ?? []).some((test) =>
            (test.results ?? []).some((result) =>
              ['passed', 'failed', 'timedOut', 'interrupted'].includes(result.status),
            ),
          )
        ) {
          files.add(spec.file.replaceAll('\\', '/').replace(/^.*?apps\/web\/e2e\//u, ''));
        }
      }
      visit(suite.suites);
    }
  }
  visit(report.suites);
  return [...files].sort();
}
