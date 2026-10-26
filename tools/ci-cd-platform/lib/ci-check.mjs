import { digest, validateDeliveryManifest } from './contracts.mjs';
import { successfulNxStatus } from './nx-build-tasks.mjs';
import { DISPATCH_JOB_IDS, validateDispatch, taskCommand, buildCommand } from './dispatch.mjs';

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
      const expectedCommand =
        plan.job === 'build'
          ? buildCommand(manifest.dispatch.jobs.build.tasks)
          : taskCommand(plan.task);
      if (JSON.stringify(expectedCommand) !== JSON.stringify(receipt.command))
        failures.push(`${key}:wrong-command`);
      if (
        plan.job === 'build' &&
        (!successfulNxStatus(receipt.nx?.status) ||
          ![plan.task.key, `${plan.task.key}:production`].includes(receipt.nx?.taskId))
      )
        failures.push(`${key}:invalid-nx-result`);

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
  if (!Array.isArray(webReceipts) || webReceipts.length)
    failures.push('web:unexpected-pr-evidence');
  return { state: failures.length ? 'failure' : 'success', failures, jobs };
}
