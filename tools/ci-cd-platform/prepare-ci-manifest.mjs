#!/usr/bin/env node
import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { buildDeliveryManifest, writeManifestOutputs } from './generate-delivery-manifest.mjs';
import { digest } from './lib/contracts.mjs';
import { resolvePrEvidence, candidateRequired, requireProof } from './lib/ci-evidence.mjs';
import {
  githubEvidenceClient,
  git,
  gitCommit,
  inputsDigest,
  changedFiles,
} from './lib/github-evidence.mjs';

async function main() {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const eventName = process.env.GITHUB_EVENT_NAME;
  const head = (await git(['rev-parse', 'HEAD'])).trim();
  requireProof(head === process.env.GITHUB_SHA, 'checkout HEAD does not match event SHA');
  const checkout = await gitCommit(head);
  const base =
    event.pull_request?.base.sha ??
    (event.before && event.before !== '0000000000000000000000000000000000000000'
      ? event.before
      : checkout.parents[0]?.sha);
  const isMainPush = eventName === 'push' && process.env.GITHUB_REF === 'refs/heads/main';
  const candidate =
    isMainPush && (await candidateRequired({ before: event.before, sha: head, changedFiles }));
  let execution;
  if (isMainPush) {
    try {
      execution = await resolvePrEvidence({
        ...githubEvidenceClient(),
        sha: head,
        before: event.before,
        regenerateManifest: buildDeliveryManifest,
      });
    } catch (error) {
      execution = { mode: 'full', reason: error.message };
    }
    execution = { ...execution, candidate };
  }
  const manifest = await buildDeliveryManifest({
    base,
    head,
    full: isMainPush ? execution.mode !== 'reuse' : eventName !== 'pull_request',
  });
  if (execution) {
    if (execution.mode === 'reuse') {
      manifest.lanes = Object.fromEntries(Object.keys(manifest.lanes).map((lane) => [lane, false]));
      if (manifest.laneDetails) {
        manifest.laneDetails = Object.fromEntries(
          Object.entries(manifest.laneDetails).map(([capability, detail]) => [
            capability,
            { ...detail, required: false, skipReason: 'reused pull request evidence' },
          ]),
        );
      }
    }
    manifest.execution = execution;
    const { digest: _digest, ...content } = manifest;
    manifest.digest = digest(content);
  }
  const evidence = {
    kind: 'ci-evidence-v1',
    repository: process.env.GITHUB_REPOSITORY,
    runId: Number(process.env.GITHUB_RUN_ID),
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    testedCommit: checkout.sha,
    testedTree: checkout.tree.sha,
    pushBefore: event.before ?? null,
    prHead: event.pull_request?.head.sha ?? null,
    prNumber: event.pull_request?.number ?? null,
    inputsDigest: await inputsDigest(head),
    manifest,
  };
  await mkdir('scope', { recursive: true });
  await writeFile('scope/delivery-manifest-v1.json', `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile('scope/ci-evidence-v1.json', `${JSON.stringify(evidence, null, 2)}\n`);
  await writeManifestOutputs(manifest, 'scope/delivery-manifest-v1.json');
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `build_required=${Boolean(manifest.lanes.validate || (execution?.mode === 'reuse' && candidate))}\n`,
    );
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `CI execution: ${execution?.mode ?? (manifest.full ? 'full' : 'PR affected')}\n\n${execution?.reason ?? ''}\n\nTree: ${checkout.tree.sha}\n`,
    );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
