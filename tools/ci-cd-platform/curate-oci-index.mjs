#!/usr/bin/env node
/**
 * Derive a deterministic, attestations-free OCI index from an immutable
 * upstream multi-architecture index. Registry-only attestation child manifests
 * are excluded when the downstream registry cannot accept them; executable
 * child manifest digests and original media types are unchanged.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
export async function writeCuratedLayout(upstream, directory) {
  const index = curatedLinuxIndex(upstream);
  // Verify copied executable manifests against the pinned descriptors.
  for (const child of index.manifests) {
    const bytes = await readFile(path.join(directory, 'blobs', 'sha256', child.digest.slice(7)));
    const digest = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
    if (digest !== child.digest || bytes.length !== child.size) {
      throw new Error('OCI child content does not match its pinned descriptor');
    }
  }
  const bytes = JSON.stringify(index);
  const digest = curatedIndexDigest(upstream);
  await mkdir(path.join(directory, 'blobs', 'sha256'), { recursive: true });
  await writeFile(path.join(directory, 'blobs', 'sha256', digest.slice(7)), bytes);
  await writeFile(
    path.join(directory, 'oci-layout'),
    JSON.stringify({ imageLayoutVersion: '1.0.0' }),
  );
  await writeFile(
    path.join(directory, 'index.json'),
    JSON.stringify({
      schemaVersion: 2,
      manifests: [
        {
          mediaType: index.mediaType,
          digest,
          size: Buffer.byteLength(bytes),
          annotations: { 'org.opencontainers.image.ref.name': 'curated' },
        },
      ],
    }),
  );
  return digest;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--layout')) {
    throw new Error('reads one source OCI index from stdin; optional --layout <directory>');
  }
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk.toString('utf8');
  const upstream = JSON.parse(raw);
  console.log(
    args.length ? await writeCuratedLayout(upstream, args[1]) : curatedIndexDigest(upstream),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`CURATED_OCI=FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
