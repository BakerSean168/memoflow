#!/usr/bin/env node
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { githubEvidenceClient } from './lib/github-evidence.mjs';
import {
  verifyPromotionEvidence,
  verifyCandidateRun,
  verifyCandidateChain,
} from './lib/promotion-evidence.mjs';
import { buildDeliveryManifest } from './generate-delivery-manifest.mjs';
import { validateCandidateSet } from './candidate-manifest.mjs';
import { requireProof, verifyCiRun } from './lib/ci-evidence.mjs';
import { validateDeliveryManifest } from './lib/contracts.mjs';

async function main() {
  const client = githubEvidenceClient();
  const sha = process.env.TESTED_SHA;
  let runId = process.env.CI_RUN_ID;
  let candidate;
  if (process.env.CANDIDATE_RUN_ID) {
    const candidateRun = await verifyCandidateRun({
      ...client,
      runId: process.env.CANDIDATE_RUN_ID,
      sha,
    });
    candidate = await client.readArtifactJson(
      candidateRun,
      `candidate-set-${sha}`,
      'candidate-set-v1.json',
    );
    requireProof(validateCandidateSet(candidate).length === 0, 'invalid candidate manifest');
    requireProof(
      !runId || String(runId) === String(candidate.ciRunId),
      'candidate/main CI run mismatch',
    );
    runId = candidate.ciRunId;
    await mkdir('reports/candidate', { recursive: true });
    await writeFile(
      'reports/candidate/candidate-set-v1.json',
      `${JSON.stringify(candidate, null, 2)}\n`,
    );
  }
  if (!runId) {
    const runs = await client.api(
      `/repos/${client.repository}/actions/workflows/ci.yml/runs?event=push&head_sha=${sha}&per_page=100`,
    );
    requireProof(
      Array.isArray(runs.workflow_runs) && runs.total_count === runs.workflow_runs.length,
      'incomplete CI run list',
    );
    runId = runs.workflow_runs.sort((a, b) => b.id - a.id)[0]?.id;
  }
  if (process.argv.includes('--allow-docs')) {
    const run = await verifyCiRun({ ...client, runId, head: sha, event: 'push' });
    const evidence = await client.readEvidence(run);
    if (evidence.manifest?.execution?.candidate === false) {
      requireProof(
        evidence.testedCommit === sha && evidence.runId === run.id,
        'wrong docs evidence',
      );
      if (process.env.GITHUB_OUTPUT)
        await appendFile(process.env.GITHUB_OUTPUT, 'eligible=false\n');
      console.log('No proven runtime change: no Candidate.');
      return;
    }
  }
  const chain = await verifyPromotionEvidence({
    ...client,
    sha,
    runId,
    regenerateManifest: buildDeliveryManifest,
  });
  if (process.env.CANDIDATE_MANIFEST)
    candidate = JSON.parse(await readFile(process.env.CANDIDATE_MANIFEST, 'utf8'));
  if (candidate) {
    requireProof(validateCandidateSet(candidate).length === 0, 'invalid candidate manifest');
    verifyCandidateChain(candidate, chain);
  }
  if (process.env.LOCAL_DELIVERY_MANIFEST) {
    const manifest = validateDeliveryManifest(
      JSON.parse(await readFile(process.env.LOCAL_DELIVERY_MANIFEST, 'utf8')),
    );
    requireProof(
      manifest.digest === chain.deliveryManifestDigest && manifest.head === sha,
      'downloaded build manifest mismatch',
    );
  }
  await mkdir('reports/ci-cd-platform', { recursive: true });
  await writeFile('reports/ci-cd-platform/ci-chain-v1.json', `${JSON.stringify(chain, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `run_id=${chain.ciRunId}\neligible=true\n`);
  console.log(JSON.stringify(chain, null, 2));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
