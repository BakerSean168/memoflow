#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { githubEvidenceClient } from './lib/github-evidence.mjs';
import { validateDeliveryManifest } from './lib/contracts.mjs';
import { requireProof, verifyCiRun } from './lib/ci-evidence.mjs';

async function main() {
  const client = githubEvidenceClient();
  const run = await verifyCiRun({
    ...client,
    runId: process.env.CI_RUN_ID,
    head: process.env.TESTED_SHA,
    event: 'push',
  });
  const artifact = await client.artifact(run, 'ci-build-artifacts');
  const temporary = await mkdtemp(path.join(tmpdir(), 'ci-build-'));
  try {
    const response = await fetch(
      `https://api.github.com/repos/${client.repository}/actions/artifacts/${artifact.id}/zip`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
        signal: AbortSignal.timeout(180_000),
      },
    );
    requireProof(response.ok, `build download failed: ${response.status}`);
    const archive = path.join(temporary, 'build.zip');
    const hash = createHash('sha256');
    let size = 0;
    await pipeline(
      response.body,
      new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          if (size > 2 * 1024 ** 3) {
            callback(new Error('build artifact exceeds 2 GiB'));
            return;
          }
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      createWriteStream(archive),
    );
    requireProof(
      `sha256:${hash.digest('hex')}` === artifact.digest,
      'build artifact archive digest mismatch',
    );
    const exec = promisify(execFile);
    const { stdout } = await exec('unzip', ['-Z1', archive], {
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    requireProof(
      stdout
        .split('\n')
        .filter(Boolean)
        .every(
          (file) =>
            !file.startsWith('/') && !file.includes('\\') && !file.split('/').includes('..'),
        ),
      'unsafe artifact path',
    );
    await exec('unzip', ['-oq', archive, '-d', process.cwd()], {
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const evidence = await client.readEvidence(run);
    const downloaded = validateDeliveryManifest(
      JSON.parse(await readFile('scope/delivery-manifest-v1.json', 'utf8')),
    );
    requireProof(
      evidence.runId === run.id &&
        evidence.runAttempt === run.run_attempt &&
        evidence.testedCommit === run.head_sha &&
        evidence.manifest?.digest === downloaded.digest &&
        downloaded.commit === run.head_sha,
      'build/test evidence manifest mismatch',
    );
    console.log(`Verified CI build archive ${artifact.id}: ${artifact.digest}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
