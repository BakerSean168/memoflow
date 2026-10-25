import { readFileSync } from 'node:fs';
const history = JSON.parse(readFileSync(new URL('../server-test-durations.json', import.meta.url)));
const measured = Object.values(history.tasks).sort((a, b) => a - b);
if (!measured.length || measured.some((ms) => !Number.isFinite(ms) || ms <= 0))
  throw new Error('Invalid Server task history');
const median = measured[Math.floor(measured.length / 2)];
// Bootstrap from an observed run. Setup and Nx process costs are explicit
// budget estimates, not measured speedups; refresh with task receipts after CI.
export const SERVER_SHARD_POLICY = Object.freeze({
  setupMs: 35_000,
  processMs: 2_000,
  targetMs: 90_000,
  maxShards: 3,
});
export function planServerShards(tasks) {
  const weight = (task) => (history.tasks[task.key] ?? median) + SERVER_SHARD_POLICY.processMs;
  const total = tasks.reduce((sum, task) => sum + weight(task), 0);
  const count = tasks.length
    ? Math.min(
        tasks.length,
        SERVER_SHARD_POLICY.maxShards,
        Math.max(
          1,
          Math.ceil(total / (SERVER_SHARD_POLICY.targetMs - SERVER_SHARD_POLICY.setupMs)),
        ),
      )
    : 0;
  const bins = Array.from({ length: count }, (_, i) => ({
    id: `${i + 1}/${count}`,
    keys: [],
    estimatedMs: 0,
  }));
  for (const task of [...tasks].sort(
    (a, b) => weight(b) - weight(a) || a.key.localeCompare(b.key),
  )) {
    const bin = bins.reduce((a, b) => (a.estimatedMs <= b.estimatedMs ? a : b));
    bin.keys.push(task.key);
    bin.estimatedMs += weight(task);
  }
  return bins;
}
