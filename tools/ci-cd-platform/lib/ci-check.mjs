import { digest, validateDeliveryManifest } from './contracts.mjs';
import { DISPATCH_JOB_IDS, validateDispatch, taskCommand, batchCommand } from './dispatch.mjs';

export const CI_CHECK_JOBS = Object.freeze({
  'scope-detector': () => true,
  ...Object.fromEntries(DISPATCH_JOB_IDS.map((id) => [id, (m) => m.dispatch.jobs[id].required])),
});

export function evaluateCiCheck({
  needs,
  manifest,
  taskReceipts = [],
  webReceipts = [],
  runId,
  runAttempt,
  commit,
}) {
  const failures = [];
  const jobs = {};
  try {
    validateDeliveryManifest(manifest);
    validateDispatch(manifest);
    if (!needs || typeof needs !== 'object') throw new Error('needs missing');
    if (manifest.digest !== needs['scope-detector']?.outputs?.manifest_digest)
      throw new Error('Changes manifest digest mismatch');
    if (!commit || manifest.commit !== commit || manifest.head !== commit)
      throw new Error('CI run SHA mismatch');
    if (!runId || !Number.isSafeInteger(runAttempt) || runAttempt < 1)
      throw new Error('CI run identity missing');
  } catch (error) {
    return { state: 'failure', failures: [`manifest:${error.message}`], jobs };
  }
  for (const id of Object.keys(needs))
    if (!(id in CI_CHECK_JOBS)) failures.push(`${id}:unknown-job`);
  for (const [id, enabled] of Object.entries(CI_CHECK_JOBS)) {
    const expected = enabled(manifest) ? 'success' : 'skipped';
    const actual = needs[id]?.result ?? 'missing';
    jobs[id] = { expected, actual };
    if (actual !== expected) failures.push(`${id}:${actual}`);
  }
  if (!Array.isArray(taskReceipts)) failures.push('tasks:invalid-receipts');
  else {
    const expected = new Map(
      Object.entries(manifest.dispatch.jobs).flatMap(([job, detail]) =>
        detail.tasks.map((task) => [`${job}/${task.key}`, { job, task }]),
      ),
    );
    const latest = new Map();
    const attempts = new Set();
    for (const receipt of taskReceipts) {
      const key = `${receipt?.job}/${receipt?.key}`;
      const plan = expected.get(key);
      if (!plan) {
        failures.push(`${key}:unexpected-receipt`);
        continue;
      }
      const { digest: receiptDigest, ...body } = receipt;
      const expectedShard =
        plan.job === 'verification-children'
          ? manifest.dispatch.serverShards.find((s) => s.keys.includes(plan.task.key))?.id
          : null;
      if ((receipt.resourceShard ?? null) !== expectedShard)
        failures.push(`${key}:wrong-resource-shard`);
      const allowedCommands = [taskCommand(plan.task)];
      if (['build', 'typecheck', 'build-backend'].includes(plan.job))
        allowedCommands.push(
          batchCommand(
            manifest.dispatch.jobs[plan.job].tasks.filter((t) => t.target === plan.task.target),
          ),
        );
      if (!allowedCommands.some((c) => JSON.stringify(c) === JSON.stringify(receipt.command)))
        failures.push(`${key}:wrong-command`);

      if (
        receiptDigest !== digest(body) ||
        receipt.kind !== 'ci-task-receipt-v1' ||
        receipt.version !== 1 ||
        !Number.isFinite(receipt.durationMs) ||
        receipt.durationMs < 0 ||
        receipt.commit !== commit ||
        receipt.runId !== runId ||
        !Number.isSafeInteger(receipt.runAttempt) ||
        receipt.runAttempt < 1 ||
        receipt.runAttempt > runAttempt ||
        receipt.manifestDigest !== (plan.job === 'lint' ? null : manifest.digest) ||
        receipt.taskDigest !== digest(plan.task) ||
        receipt.planDigest !== digest(manifest.dispatch.jobs[plan.job].tasks) ||
        !Array.isArray(receipt.command) ||
        receipt.command.length === 0
      ) {
        failures.push(`${key}:invalid-provenance`);
        continue;
      }
      const attemptKey = `${key}/${receipt.runAttempt}`;
      if (attempts.has(attemptKey)) failures.push(`${key}:duplicate-attempt`);
      attempts.add(attemptKey);
      if (!latest.has(key) || latest.get(key).runAttempt < receipt.runAttempt)
        latest.set(key, receipt);
    }
    for (const key of expected.keys()) {
      const receipt = latest.get(key);
      if (!receipt) failures.push(`${key}:missing-receipt`);
      else if (receipt.exitCode !== 0 || receipt.signal || receipt.error)
        failures.push(`${key}:failed-receipt`);
    }
  }
  const shards = manifest.lanes.web ? manifest.webShards.shards : [];
  if (!Array.isArray(webReceipts)) failures.push('web:invalid-receipts');
  else {
    const latest = new Map();
    const attempts = new Set();
    for (const receipt of webReceipts) {
      if (!shards.some((s) => s.id === receipt?.id)) {
        failures.push('web:extra-shard');
        continue;
      }
      if (
        receipt.runId !== runId ||
        receipt.commit !== commit ||
        receipt.manifestDigest !== manifest.digest ||
        !Number.isSafeInteger(receipt.runAttempt) ||
        receipt.runAttempt < 1 ||
        receipt.runAttempt > runAttempt
      ) {
        failures.push(`web:${receipt.id}:invalid-provenance`);
        continue;
      }
      const key = `${receipt.id}/${receipt.runAttempt}`;
      if (attempts.has(key)) failures.push(`web:${receipt.id}:duplicate-attempt`);
      attempts.add(key);
      if (!latest.has(receipt.id) || latest.get(receipt.id).runAttempt < receipt.runAttempt)
        latest.set(receipt.id, receipt);
    }
    for (const shard of shards) {
      const receipt = latest.get(shard.id);
      if (!receipt) failures.push(`web:${shard.id}:missing-shard`);
      else if (
        receipt.exitCode !== 0 ||
        JSON.stringify([...(receipt.specs ?? [])].sort()) !==
          JSON.stringify([...shard.specs].sort())
      )
        failures.push(`web:${shard.id}:invalid-evidence`);
    }
  }
  return { state: failures.length ? 'failure' : 'success', failures, jobs };
}
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
