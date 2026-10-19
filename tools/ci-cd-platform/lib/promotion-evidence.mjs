import { digest, validateDeliveryManifest } from './contracts.mjs';
import { requireProof, verifyCiRun, verifyPrEvidence, verifyUnitJobs } from './ci-evidence.mjs';

export async function verifyPromotionEvidence(options) {
  const { api, repository, sha, runId, readEvidence, gitCommit, inputsDigest, artifact } = options;
  const run = await verifyCiRun({ api, repository, runId, head: sha, event: 'push' });
  const evidence = await readEvidence(run);
  requireProof(
    evidence?.kind === 'ci-evidence-v1' &&
      evidence.repository === repository &&
      evidence.runId === run.id &&
      evidence.runAttempt === run.run_attempt &&
      evidence.testedCommit === sha,
    'wrong main evidence identity',
  );
  const manifest = validateDeliveryManifest(evidence.manifest);
  verifyUnitJobs(run, manifest);
  requireProof(
    manifest.commit === sha &&
      manifest.head === sha &&
      manifest.event === 'push' &&
      manifest.execution?.candidate === true,
    'docs-only or unbound main manifest cannot promote',
  );
  const [local, remote] = await Promise.all([
    gitCommit(sha),
    api(`/repos/${repository}/git/commits/${sha}`),
  ]);
  requireProof(
    local.sha === sha &&
      remote.sha === sha &&
      /^[a-f0-9]{40}$/u.test(local.tree?.sha) &&
      local.tree.sha === evidence.testedTree &&
      local.tree.sha === remote.tree?.sha &&
      evidence.inputsDigest === (await inputsDigest(sha)),
    'main tree/inputs mismatch',
  );
  let testEvidence;
  if (manifest.execution.mode === 'reuse') {
    const proof = await verifyPrEvidence({
      ...options,
      before: evidence.pushBefore,
      now: Date.parse(run.created_at),
    });
    const { candidate: _candidate, ...recorded } = manifest.execution;
    requireProof(digest(proof) === digest(recorded), 'recorded PR proof mismatch');
    testEvidence = proof;
  } else {
    requireProof(
      manifest.execution.mode === 'full' &&
        manifest.full === true &&
        [
          'governance',
          'validate',
          'boundary',
          'integration',
          'web',
          'coverage',
          'performance',
        ].every((lane) => manifest.lanes[lane] === true),
      'main has no full test evidence',
    );
    testEvidence = {
      testRunId: run.id,
      testHead: sha,
      testedCommit: sha,
      testedTree: local.tree.sha,
      manifestDigest: manifest.digest,
    };
  }
  const build = await artifact(run, 'ci-build-artifacts');
  requireProof(
    /^sha256:[a-f0-9]{64}$/u.test(build.digest) && Number.isSafeInteger(build.id),
    'invalid build artifact digest',
  );
  return {
    kind: 'ci-chain-v1',
    repository,
    commit: sha,
    tree: local.tree.sha,
    ciRunId: run.id,
    ciRunAttempt: run.run_attempt,
    deliveryManifestDigest: manifest.digest,
    testEvidence,
    buildArtifactId: build.id,
    buildArtifactDigest: build.digest,
  };
}

export async function verifyCandidateRun({ api, repository, runId, sha }) {
  requireProof(/^\d+$/u.test(String(runId)), 'candidate run ID required');
  const run = await api(`/repos/${repository}/actions/runs/${runId}`);
  const workflow = await api(`/repos/${repository}/actions/workflows/candidate-publish.yml`);
  requireProof(
    run.id === Number(runId) &&
      run.head_sha === sha &&
      run.head_branch === 'main' &&
      ['workflow_run', 'workflow_dispatch'].includes(run.event) &&
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      run.path === '.github/workflows/candidate-publish.yml' &&
      run.workflow_id === workflow.id &&
      workflow.path === run.path &&
      run.repository?.full_name === repository &&
      run.repository?.fork === false &&
      run.head_repository?.full_name === repository &&
      run.head_repository?.fork === false,
    'untrusted Candidate run',
  );
  return run;
}

/** Bind the candidate's recorded provenance to a freshly API-verified source chain. */
export function verifyCandidateChain(candidate, chain) {
  requireProof(
    candidate?.gitSha === chain.commit &&
      String(candidate.ciRunId) === String(chain.ciRunId) &&
      candidate.deliveryManifestDigest === `sha256:${chain.deliveryManifestDigest}` &&
      digest(candidate.ciEvidence) === digest(chain),
    'candidate provenance chain mismatch',
  );
}
