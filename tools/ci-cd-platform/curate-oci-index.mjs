#!/usr/bin/env node
/**
 * Derive a deterministic, attestations-free OCI index from an immutable
 * upstream multi-architecture index. Registry-only attestation child manifests
 * are excluded when the downstream registry cannot accept them; executable
 * child manifest digests and original media types are unchanged.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { validateOciPlatforms } from './verify-oci-platforms.mjs';

const PLATFORMS = ['amd64', 'arm64'];
export function curatedLinuxIndex(upstream) {
  const errors = validateOciPlatforms(upstream);
  if (errors.length) throw new Error(errors.join('; '));
  const manifests = PLATFORMS.map((arch) =>
    upstream.manifests.find(
      (entry) => entry.platform?.os === 'linux' && entry.platform?.architecture === arch,
    ),
  );
  return {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    manifests,
  };
}
export function curatedIndexDigest(upstream) {
  const bytes = JSON.stringify(curatedLinuxIndex(upstream));
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
async function main() {
  if (process.argv.length !== 2) throw new Error('reads one source OCI index from stdin');
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk.toString('utf8');
  console.log(curatedIndexDigest(JSON.parse(raw)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`CURATED_OCI=FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
