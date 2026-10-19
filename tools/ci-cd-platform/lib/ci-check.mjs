/**
 * CI Check: the single aggregate gate for ci.yml.
 *
 * The delivery manifest is the only authority on which lane jobs must run.
 * A job may be `skipped` only when the manifest disabled it; every other
 * non-success result (failure, cancelled, unexpected skip, unexpected run,
 * missing job) fails the gate. Unknown inputs fail closed.
 */
import { validateDeliveryManifest } from './contracts.mjs';
import { UNIT_JOB_IDS, unitJobEnabled } from './unit-shards.mjs';

/** Lane jobs the gate aggregates, and how the manifest decides each one. */
export const CI_CHECK_JOBS = Object.freeze({
  'scope-detector': () => true,
  governance: (m) => m.lanes.governance === true,
  'static-analysis': (m) => m.lanes.validate === true,
  ...Object.fromEntries(UNIT_JOB_IDS.map((id) => [id, (m) => unitJobEnabled(m, id)])),
  typecheck: (m) => m.lanes.validate === true,
  build: (m) =>
    m.lanes.validate === true || (m.execution?.mode === 'reuse' && m.execution.candidate === true),
  'verification-children': (m) =>
    m.lanes.boundary === true ||
    m.lanes.integration === true ||
    m.lanes.coverage === true ||
    m.lanes.performance === true,
  'web-flow-shard': (m) => m.lanes.web === true,
});

/** Sub-lanes reported by verification-children outputs. */
export const VERIFICATION_SUBLANES = Object.freeze([
  'boundary',
  'integration',
  'coverage',
  'performance',
]);

function validateManifest(manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== 'object') return ['manifest:missing'];
  try {
    validateDeliveryManifest(manifest);
  } catch (error) {
    return [`manifest:invalid: ${error.message}`];
  }
  const lanes = manifest.lanes;
  if (!lanes || typeof lanes !== 'object') problems.push('manifest:lanes');
  else {
    for (const lane of ['governance', 'validate', 'web', ...VERIFICATION_SUBLANES]) {
      if (typeof lanes[lane] !== 'boolean') problems.push(`manifest:lane-${lane}`);
    }
  }
  if (!Array.isArray(manifest.scope?.unit)) problems.push('manifest:scope-unit');
  return problems;
}

/**
 * @param {{ needs: Record<string, {result: string, outputs?: Record<string,string>}>, manifest: object | null }} input
 * @returns {{ state: 'success' | 'failure', failures: string[], jobs: Record<string, {expected: string, actual: string}> }}
 */
export function evaluateCiCheck({ needs, manifest, webReceipts = [] }) {
  const failures = [];
  const jobs = {};
  if (!needs || typeof needs !== 'object') {
    return { state: 'failure', failures: ['needs:missing'], jobs };
  }
  const detector = needs['scope-detector']?.result;
  if (detector !== 'success') failures.push(`scope-detector:${detector ?? 'missing'}`);
  const manifestProblems = validateManifest(manifest);
  failures.push(...manifestProblems);
  if (manifestProblems.length === 0) {
    const expectedDigest = needs['scope-detector']?.outputs?.manifest_digest;
    if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedDigest))
      failures.push('manifest:detector-digest-invalid');
    else if (manifest.digest !== expectedDigest) failures.push('manifest:digest-mismatch');
  }
  for (const name of Object.keys(needs)) {
    if (!(name in CI_CHECK_JOBS)) failures.push(`${name}:unknown-job`);
  }
  if (failures.length > 0) return { state: 'failure', failures, jobs };

  for (const [name, isEnabled] of Object.entries(CI_CHECK_JOBS)) {
    const job = needs[name];
    if (!job) {
      failures.push(`${name}:missing-from-needs`);
      continue;
    }
    const expected = isEnabled(manifest) ? 'success' : 'skipped';
    jobs[name] = { expected, actual: job.result };
    if (job.result === expected) continue;
    if (expected === 'skipped') failures.push(`${name}:unexpected-${job.result}`);
    else failures.push(`${name}:${job.result}`);
  }

  const verification = needs['verification-children'];
  if (verification?.result === 'success') {
    for (const lane of VERIFICATION_SUBLANES) {
      const expected = manifest.lanes[lane] ? 'success' : 'skipped';
      const actual = verification.outputs?.[lane] || 'missing';
      jobs[`verification-children/${lane}`] = { expected, actual };
      if (actual !== expected) {
        failures.push(
          `verification-children/${lane}:${expected === 'skipped' ? `unexpected-${actual}` : actual}`,
        );
      }
    }
  }
  const expectedShards = manifest.lanes.web ? manifest.webShards.shards : [];
  if (!Array.isArray(webReceipts)) failures.push('web:invalid-receipts');
  else {
    if (webReceipts.length !== expectedShards.length) failures.push('web:shard-count-mismatch');
    for (const shard of expectedShards) {
      const matches = webReceipts.filter((receipt) => receipt?.id === shard.id);
      if (matches.length !== 1) {
        failures.push(`web:${shard.id}:missing-or-duplicate-shard`);
        continue;
      }
      const receipt = matches[0];
      if (receipt.manifestDigest !== manifest.digest || receipt.exitCode !== 0)
        failures.push(`web:${shard.id}:invalid-evidence`);
      if (
        !Array.isArray(receipt.specs) ||
        JSON.stringify([...receipt.specs].sort()) !== JSON.stringify([...shard.specs].sort())
      ) {
        failures.push(`web:${shard.id}:spec-coverage`);
      }
    }
    for (const receipt of webReceipts) {
      if (!expectedShards.some((shard) => shard.id === receipt?.id))
        failures.push('web:extra-shard');
    }
  }
  return { state: failures.length ? 'failure' : 'success', failures, jobs };
}
