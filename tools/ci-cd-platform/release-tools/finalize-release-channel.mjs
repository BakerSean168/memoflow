import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import lifecycle from '../lib/release-lifecycle.cjs';

export async function finalizeReleaseChannel({
  manifestPath,
  evidenceRoot,
  channel,
  runId,
  runAttempt,
  sourceNightly = '',
  sourceNightlyDigest = '',
  runtimeDigest,
}) {
  const release = JSON.parse(await readFile(manifestPath, 'utf8'));
  const { sourceVersion } = lifecycle.releaseVersion(release.tag, channel);
  assert(/^[a-f0-9]{40}$/u.test(release.gitSha), 'invalid release SHA');
  assert(release.postflight?.status === 'passed', 'release postflight must pass');
  assert(
    Number.isSafeInteger(Number(runId)) &&
      Number(runId) > 0 &&
      Number.isSafeInteger(Number(runAttempt)) &&
      Number(runAttempt) > 0,
    'publication run identity required',
  );
  const qualityBytes = await readFile(path.join(evidenceRoot, 'release-quality-receipt.json'));
  const quality = JSON.parse(qualityBytes.toString('utf8'));
  assert(
    quality.kind === 'release-quality-receipt' &&
      quality.schemaVersion === 1 &&
      quality.gitSha === release.gitSha &&
      quality.status === 'passed' &&
      quality.web === 'passed' &&
      quality.provider === 'passed' &&
      quality.runId === Number(runId) &&
      quality.runAttempt === Number(runAttempt),
    'release acceptance receipt identity mismatch',
  );
  release.qualityReceipt = quality;
  const remote = JSON.parse(await readFile(path.join(evidenceRoot, 'github-release.json'), 'utf8'));
  const feeds = (remote.assets ?? []).filter(
    (asset) => asset.name === 'desktop-update-feed.tar.gz',
  );
  assert(
    feeds.length === 1 &&
      /^sha256:[a-f0-9]{64}$/u.test(feeds[0].digest ?? '') &&
      Number.isSafeInteger(feeds[0].size) &&
      feeds[0].size > 0,
    'missing verified update feed archive',
  );
  release.updateFeedArchive = {
    name: feeds[0].name,
    digest: feeds[0].digest,
    size: feeds[0].size,
    channel,
  };
  release.channel = channel;
  release.publication = { runId: Number(runId), runAttempt: Number(runAttempt) };
  if (channel === 'stable') {
    assert(
      lifecycle.releaseVersion(sourceNightly, 'nightly').sourceVersion === sourceVersion &&
        /^sha256:[a-f0-9]{64}$/u.test(sourceNightlyDigest),
      'Stable must be bound to its verified Nightly',
    );
    release.sourceNightly = {
      tag: sourceNightly,
      manifestDigest: sourceNightlyDigest,
      gitSha: release.gitSha,
      desktopMode: 'same-source-repack',
      imageMode: 'digest-retag',
    };
  }
  const releaseBytes = Buffer.from(JSON.stringify(release, null, 2) + '\n');
  await writeFile(manifestPath, releaseBytes);
  if (channel === 'stable') return release;
  const evidence = { 'release-manifest.json': lifecycle.hash(releaseBytes) };
  const manifests = {};
  for (const name of [
    'candidate-set-v1.json',
    'desktop-release-manifest.json',
    'docker-release-manifest.json',
  ]) {
    const bytes = await readFile(path.join(evidenceRoot, name));
    evidence[name] = lifecycle.hash(bytes);
    manifests[name] = JSON.parse(bytes.toString('utf8'));
  }
  const nightly = {
    kind: 'memoflow-nightly',
    schemaVersion: 1,
    channel: 'nightly',
    tag: release.tag,
    sourceVersion,
    gitSha: release.gitSha,
    ciRunId: release.ciRunId,
    runId: Number(runId),
    runAttempt: Number(runAttempt),
    evidence,
    runtimeArtifact: { digest: runtimeDigest },
    quality: { status: 'passed', desktop: 'passed', images: 'passed', acceptance: 'passed' },
  };
  lifecycle.validateNightlyEvidence({
    nightly,
    release,
    candidate: manifests['candidate-set-v1.json'],
    desktop: manifests['desktop-release-manifest.json'],
    docker: manifests['docker-release-manifest.json'],
    sha: release.gitSha,
    tag: release.tag,
  });
  await writeFile(
    path.join(path.dirname(manifestPath), 'nightly-manifest.json'),
    JSON.stringify(nightly, null, 2) + '\n',
  );
  return nightly;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await finalizeReleaseChannel({
    manifestPath: process.argv[2],
    evidenceRoot: process.argv[3],
    channel: process.env.RELEASE_CHANNEL,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    sourceNightly: process.env.SOURCE_NIGHTLY,
    sourceNightlyDigest: process.env.SOURCE_NIGHTLY_DIGEST,
    runtimeDigest: process.env.NIGHTLY_RUNTIME_DIGEST,
  });
}
