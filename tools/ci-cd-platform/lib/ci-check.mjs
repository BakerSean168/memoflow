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
  'web-specialized': (m) => m.lanes.web === true,
  'component-browser': (m) => m.laneDetails?.componentBrowser?.required === true,
  contract: (m) => m.laneDetails?.contract?.required === true,
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
 * The GitHub Artifact directory encodes the attempt and zero-based matrix
 * index. Never accept a receipt copied beneath a different attempt/shard.
 * `actions/download-artifact` extracts a lone pattern match directly into
 * the target directory, so a single-shard run produces a flat
 * `shard-<n>.json` path; for that layout only the file name can be bound
 * here and the run/attempt/digest identity is enforced by the content
 * checks in evaluateCiCheck.
 */
export function validWebReceiptArtifactPath(relativePath, receipt) {
  const match = /^web-shard-receipt-(\d+)-(\d+)\/shard-(\d+)\.json$/u.exec(relativePath);
  const flat = /^shard-(\d+)\.json$/u.exec(relativePath);
  const shard = /^(\d+)\/(\d+)$/u.exec(receipt?.id ?? '');
  if (flat) return Boolean(shard && Number(flat[1]) === Number(shard[1]));
  return Boolean(
    match &&
    shard &&
    Number(match[1]) === receipt.runAttempt &&
    Number(match[2]) + 1 === Number(shard[1]) &&
    Number(match[3]) === Number(shard[1]),
  );
}

/**
 * @param {{ needs: Record<string, {result: string, outputs?: Record<string,string>}>, manifest: object | null }} input
 * @returns {{ state: 'success' | 'failure', failures: string[], jobs: Record<string, {expected: string, actual: string}> }}
 */
export function evaluateCiCheck({
  needs,
  manifest,
  webReceipts = [],
  runId = null,
  runAttempt = null,
  capabilityResults = {},
}) {
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

  // Capability gate (VNext Q2): the manifest's laneDetails plan states what
  // must run; the stage passes results only for capabilities it wires.
  // A wired capability that the plan requires must report success — a
  // conditionally skipped GitHub job therefore cannot fake green.
  for (const [capability, result] of Object.entries(capabilityResults)) {
    const detail = manifest.laneDetails?.[capability];
    if (!detail) {
      failures.push(`capability:${capability}:no-plan`);
      continue;
    }
    jobs[`capability/${capability}`] = {
      expected: detail.required ? 'success' : 'any',
      actual: result,
    };
    if (detail.required && result !== 'success') {
      failures.push(`capability:${capability}:${result ?? 'missing'}`);
    }
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
    const latestByShard = new Map();
    const observedAttempts = new Set();
    const validRunIdentity =
      typeof runId === 'string' &&
      runId.length > 0 &&
      Number.isSafeInteger(runAttempt) &&
      runAttempt > 0;
    if (expectedShards.length > 0 && !validRunIdentity) failures.push('web:invalid-run-identity');
    for (const receipt of webReceipts) {
      if (!expectedShards.some((shard) => shard.id === receipt?.id)) {
        failures.push('web:extra-shard');
        continue;
      }
      const key = `${receipt.id}:${receipt.runAttempt}`;
      if (observedAttempts.has(key)) {
        failures.push(`web:${receipt.id}:duplicate-attempt`);
        continue;
      }
      observedAttempts.add(key);
      // Older failed attempts are audit evidence only. The most recent
      // execution is authoritative, even if it failed after an earlier pass.
      if (
        !validRunIdentity ||
        receipt.runId !== runId ||
        !Number.isSafeInteger(receipt.runAttempt) ||
        receipt.runAttempt < 1 ||
        receipt.runAttempt > runAttempt ||
        receipt.manifestDigest !== manifest.digest
      ) {
        failures.push(`web:${receipt.id}:invalid-provenance`);
        continue;
      }
      const previous = latestByShard.get(receipt.id);
      if (!previous || receipt.runAttempt > previous.runAttempt) {
        latestByShard.set(receipt.id, receipt);
      }
    }
    if (latestByShard.size !== expectedShards.length) failures.push('web:shard-count-mismatch');
    for (const shard of expectedShards) {
      const receipt = latestByShard.get(shard.id);
      if (!receipt) {
        failures.push(`web:${shard.id}:missing-shard`);
        continue;
      }
      if (receipt.exitCode !== 0) failures.push(`web:${shard.id}:invalid-evidence`);
      if (
        !Array.isArray(receipt.specs) ||
        JSON.stringify([...receipt.specs].sort()) !== JSON.stringify([...shard.specs].sort())
      ) {
        failures.push(`web:${shard.id}:spec-coverage`);
      }
    }
  }
  return { state: failures.length ? 'failure' : 'success', failures, jobs };
}
