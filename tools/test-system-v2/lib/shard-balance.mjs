/**
 * Deterministic longest-processing-time (LPT) shard planner for Playwright
 * spec files (Playwright shards by file when fullyParallel is off).
 *
 * - Every spec lands in exactly one shard.
 * - Specs without timing history weigh the median of the known specs, so a
 *   new or renamed spec neither dominates nor vanishes from the balance.
 * - Ordering is total (duration desc, path asc; lightest shard, lowest index),
 *   so every runner computes the same plan from the same inputs.
 */
export function medianDuration(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return 1;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function planShards({ specs, durations = {}, shardCount }) {
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error(`shardCount must be a positive integer, got ${shardCount}`);
  }
  const unique = [...new Set(specs)];
  if (unique.length !== specs.length) throw new Error('spec list contains duplicates');
  const known = unique.filter((spec) => Number.isFinite(durations[spec]?.durationMs));
  const defaultMs = medianDuration(known.map((spec) => durations[spec].durationMs));
  const weighted = unique
    .map((path) => ({ path, durationMs: durations[path]?.durationMs ?? defaultMs }))
    .sort((a, b) => b.durationMs - a.durationMs || a.path.localeCompare(b.path));
  const shards = Array.from({ length: shardCount }, (_, index) => ({
    index,
    totalMs: 0,
    specs: [],
  }));
  for (const spec of weighted) {
    const shard = shards.reduce((lightest, current) =>
      current.totalMs < lightest.totalMs ? current : lightest,
    );
    shard.specs.push(spec.path);
    shard.totalMs += spec.durationMs;
  }
  return {
    shards,
    defaultMs,
    missing: unique.filter((spec) => !known.includes(spec)).sort(),
  };
}

/** Days since the timing history was generated, or null when it carries no timestamp. */
export function durationAgeDays(history, now = Date.now()) {
  const generatedAt = Date.parse(history?.generatedAt ?? '');
  if (!Number.isFinite(generatedAt)) return null;
  return Math.floor((now - generatedAt) / 86_400_000);
}

export const DURATION_STALE_AFTER_DAYS = 21;

/** Human-readable warnings for a plan built from stale or incomplete history. */
export function planWarnings(history, plan, now = Date.now()) {
  const warnings = [];
  const age = durationAgeDays(history, now);
  if (age === null) {
    warnings.push(
      'Web Flow timing history has no generatedAt timestamp; refresh it from a CI run.',
    );
  } else if (age > DURATION_STALE_AFTER_DAYS) {
    warnings.push(
      `Web Flow timing history is ${age} days old (> ${DURATION_STALE_AFTER_DAYS}); shard balance may drift. Refresh with tools/test-system-v2/refresh-web-spec-durations.mjs.`,
    );
  }
  if (plan.missing.length > 0) {
    warnings.push(
      `No timing history for ${plan.missing.length} spec(s), weighted at the median ${plan.defaultMs}ms: ${plan.missing.join(', ')}`,
    );
  }
  return warnings;
}
