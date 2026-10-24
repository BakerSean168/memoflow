/* eslint-disable @nx/enforce-module-boundaries -- planner consumes the Web-owned canonical spec list */
import { WEB_FLOW_SPECS } from '../../../apps/web/web-flow-specs.mjs';
import { WEB_CORE_SPECS, WEB_OWNER_EXTENSIONS } from '../../../apps/web/web-core-specs.mjs';
import { medianDuration, planShards } from './shard-balance.mjs';

// Wall budget includes the measured fixed setup cost. Keep all tuning here.
export const WEB_SHARD_POLICY = Object.freeze({
  targetPerShardMs: 397_000,
  setupMs: 97_000,
  maxShards: 8,
  defaultShards: 4,
});

// Storybook-only files (stories and the Storybook app itself) never change
// product behavior; they are verified by the Component Browser lane (Q4)
// and must not select Web E2E specs.
const STORYBOOK_ONLY = /(^|\/)[^/]+\.stories\.[^/]+$/u;
export const isStorybookOnlyFile = (file) =>
  STORYBOOK_ONLY.test(file) || file.startsWith('apps/storybook/');

export function selectWebSpecs({ enabled, full, files }) {
  if (!enabled) return { specs: [], fallback: false };
  if (full) return { specs: [...WEB_FLOW_SPECS], fallback: false };
  if (Array.isArray(files)) {
    const productFiles = files.filter((file) => !isStorybookOnlyFile(file));
    if (files.length > 0 && productFiles.length === 0) return { specs: [], fallback: false };
    files = productFiles;
  }
  const canonical = new Set(WEB_FLOW_SPECS.map((spec) => `apps/web/e2e/${spec}`));
  if (!Array.isArray(files) || files.length === 0) {
    return { specs: [...WEB_FLOW_SPECS], fallback: true };
  }
  if (files.every((file) => canonical.has(file))) {
    return {
      specs: [...new Set(files.map((file) => file.slice('apps/web/e2e/'.length)))].sort(),
      fallback: false,
    };
  }
  const selected = new Set(WEB_CORE_SPECS);
  for (const file of files) {
    if (canonical.has(file)) {
      selected.add(file.slice('apps/web/e2e/'.length));
      continue;
    }
    const owner =
      /^packages\/app-vue\/src\/modules\/([^/]+)\//u.exec(file)?.[1] ??
      /^packages\/([^/]+)\/src\//u.exec(file)?.[1];
    const prefixes = WEB_OWNER_EXTENSIONS[owner];
    // No guessed dependency graph: shared contracts, global styles, helpers,
    // root/config and unrecognized owners retain the full four-shard fallback.
    if (!prefixes) return { specs: [...WEB_FLOW_SPECS], fallback: true };
    for (const spec of WEB_FLOW_SPECS) {
      if (prefixes.some((prefix) => spec.startsWith(prefix))) selected.add(spec);
    }
    // Goal/Task feed AI tools and planner writes; do not silently omit those consumers.
    if (['goal', 'task', 'repository'].includes(owner)) {
      for (const spec of WEB_FLOW_SPECS) {
        if (spec.startsWith('ai/') || spec.startsWith('schedule/')) selected.add(spec);
      }
    }
  }
  return { specs: [...selected].sort(), fallback: false };
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
