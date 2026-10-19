import { digest, validateDeliveryManifest } from './contracts.mjs';
import { classifyRisk } from './risk.mjs';

const SHA = /^[a-f0-9]{40}$/u;
export const MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export function requireProof(condition, reason) {
  if (!condition) throw new Error(reason);
}

// Deliberately conservative: executable tooling and configuration must earn a new full audit.
export function isCiInput(file) {
  return (
    /^(?:\.github\/|tools\/|Dockerfile|docker-compose|deployment\/|docker\/)/u.test(file) ||
    !file.includes('/') ||
    /(?:^|\/)(?:package\.json|project\.json|pnpm-lock\.yaml|uv\.lock|pyproject\.toml|requirements[^/]*|tsconfig[^/]*\.json|\.[^/]*version|\.npmrc|\.pnpmfile\.cjs|Dockerfile[^/]*)$/u.test(
      file,
    ) ||
    /(?:\.config\.[^/]+|\.lock)$/u.test(file)
  );
}

/** Only a proven runtime change authorizes Candidate; unknown ranges still require full CI. */
export async function candidateRequired({ before, sha, changedFiles }) {
  try {
    requireProof(SHA.test(before) && !/^0+$/u.test(before), 'unknown push base');
    const files = await changedFiles(before, sha);
    requireProof(Array.isArray(files), 'unknown changed files');
    return files.length > 0 && classifyRisk(files).level !== 'docs';
  } catch {
    return false;
  }
}

function completeList(value, key) {
  requireProof(
    Number.isSafeInteger(value?.total_count) &&
      Array.isArray(value[key]) &&
      value.total_count === value[key].length,
    `incomplete ${key} API response`,
  );
  return value[key];
}

export async function verifyCiRun({ api, repository, runId, head, event }) {
  requireProof(
    /^[\w.-]+\/[\w.-]+$/u.test(repository) && /^\d+$/u.test(String(runId)) && SHA.test(head),
    'invalid run identity',
  );
  const root = `/repos/${repository}`;
  const run = await api(`${root}/actions/runs/${runId}`);
  const workflow = await api(`${root}/actions/workflows/ci.yml`);
  requireProof(
    run.id === Number(runId) &&
      run.head_sha === head &&
      run.event === event &&
      run.path === '.github/workflows/ci.yml' &&
      workflow.path === run.path &&
      workflow.id === run.workflow_id &&
      run.repository?.full_name === repository &&
      run.repository?.fork === false &&
      run.head_repository?.full_name === repository &&
      run.head_repository?.fork === false &&
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      Number.isSafeInteger(run.run_attempt) &&
      run.run_attempt > 0 &&
      (event !== 'push' || run.head_branch === 'main'),
    'untrusted, unsuccessful or wrong-SHA CI run',
  );
  const jobs = completeList(
    await api(`${root}/actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100`),
    'jobs',
  );
  const checks = jobs.filter((job) => job.name === 'CI Check');
  requireProof(
    checks.length === 1 &&
      checks[0].head_sha === head &&
      checks[0].status === 'completed' &&
      checks[0].conclusion === 'success',
    'CI Check missing or not green',
  );
  return run;
}

export async function resolvePrEvidence(options) {
  try {
    return await verifyPrEvidence(options);
  } catch (error) {
    return { mode: 'full', reason: error.message };
  }
}

export async function verifyPrEvidence({
  api,
  repository,
  sha,
  before,
  now = Date.now(),
  readEvidence,
  gitCommit,
  changedFiles,
  inputsDigest,
  regenerateManifest,
}) {
  requireProof(SHA.test(sha), 'invalid main SHA');
  const root = `/repos/${repository}`;
  const associated = await api(`${root}/commits/${sha}/pulls?per_page=100`);
  requireProof(
    Array.isArray(associated) && associated.length === 1,
    'missing or ambiguous associated PR',
  );
  const pr = await api(`${root}/pulls/${associated[0].number}`);
  requireProof(
    pr.number === associated[0].number &&
      pr.merged === true &&
      pr.merge_commit_sha === sha &&
      pr.base?.ref === 'main' &&
      pr.base.repo?.full_name === repository &&
      pr.head?.repo?.full_name === repository &&
      pr.head.repo.fork === false &&
      SHA.test(pr.head.sha),
    'PR is not a same-repository main merge',
  );
  const main = await api(`${root}/git/commits/${sha}`);
  requireProof(
    main.sha === sha &&
      SHA.test(main.tree?.sha) &&
      main.parents?.length === 2 &&
      main.parents[1].sha === pr.head.sha &&
      main.parents[0].sha === before,
    'base drift or non-merge push',
  );
  const files = await changedFiles(before, sha);
  requireProof(
    Array.isArray(files) &&
      files.every((file) => typeof file === 'string') &&
      !files.some(isCiInput),
    'CI configuration changed',
  );
  const runs = completeList(
    await api(
      `${root}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`,
    ),
    'workflow_runs',
  );
  // Never search backwards for an older green run when the newest run failed or was cancelled.
  runs.sort((a, b) => b.id - a.id);
  requireProof(runs.length > 0, 'missing PR CI');
  const run = await verifyCiRun({
    api,
    repository,
    runId: runs[0].id,
    head: pr.head.sha,
    event: 'pull_request',
  });
  const started = Date.parse(run.created_at),
    finished = Date.parse(run.updated_at);
  requireProof(
    Number.isFinite(started) &&
      Number.isFinite(finished) &&
      started <= finished &&
      finished <= now &&
      now - started <= MAX_EVIDENCE_AGE_MS,
    'stale CI evidence',
  );
  // readEvidence must verify the archive digest from this already authenticated run's artifact API.
  const evidence = await readEvidence(run);
  requireProof(
    evidence?.kind === 'ci-evidence-v1' &&
      evidence.runId === run.id &&
      evidence.runAttempt === run.run_attempt &&
      evidence.repository === repository &&
      evidence.prHead === pr.head.sha &&
      evidence.prNumber === pr.number &&
      SHA.test(evidence.testedCommit),
    'wrong evidence run/SHA',
  );
  const tested = await api(`${root}/git/commits/${evidence.testedCommit}`);
  requireProof(
    tested.sha === evidence.testedCommit &&
      tested.parents?.length === 2 &&
      tested.parents[0].sha === before &&
      tested.parents[1].sha === pr.head.sha,
    'tested merge has wrong SHA or base drift',
  );
  const [localTested, localMain] = await Promise.all([gitCommit(tested.sha), gitCommit(sha)]);
  requireProof(
    SHA.test(tested.tree?.sha) &&
      tested.tree.sha === main.tree.sha &&
      evidence.testedTree === tested.tree.sha &&
      localTested.tree?.sha === tested.tree.sha &&
      localMain.tree?.sha === main.tree.sha &&
      localTested.sha === tested.sha &&
      localMain.sha === sha &&
      digest(localTested.parents.map((parent) => parent.sha)) ===
        digest(tested.parents.map((parent) => parent.sha)) &&
      digest(localMain.parents.map((parent) => parent.sha)) ===
        digest(main.parents.map((parent) => parent.sha)),
    'Git tree/parents mismatch',
  );
  validateDeliveryManifest(evidence.manifest);
  requireProof(
    evidence.manifest.base === before &&
      evidence.manifest.head === tested.sha &&
      evidence.manifest.commit === tested.sha &&
      evidence.manifest.event === 'pull_request' &&
      !evidence.manifest.full &&
      !evidence.manifest.execution,
    'wrong tested manifest identity',
  );
  const regenerated = await regenerateManifest({
    base: before,
    head: tested.sha,
    event: 'pull_request',
    ref: `refs/pull/${pr.number}/merge`,
    full: false,
  });
  validateDeliveryManifest(regenerated);
  requireProof(
    regenerated.digest === evidence.manifest.digest,
    'delivery manifest digest mismatch',
  );
  const configDigest = await inputsDigest(sha);
  requireProof(
    /^[a-f0-9]{64}$/u.test(evidence.inputsDigest) &&
      evidence.inputsDigest === configDigest &&
      (await inputsDigest(tested.sha)) === configDigest,
    'manifest inputs/config digest mismatch',
  );
  return {
    mode: 'reuse',
    testRunId: run.id,
    testRunAttempt: run.run_attempt,
    testHead: run.head_sha,
    testedCommit: tested.sha,
    testedTree: tested.tree.sha,
    manifestDigest: regenerated.digest,
    inputsDigest: configDigest,
    prNumber: pr.number,
  };
}
