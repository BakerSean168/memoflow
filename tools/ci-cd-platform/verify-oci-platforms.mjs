#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const REQUIRED_PRODUCTION_PLATFORMS = Object.freeze(['linux/amd64', 'linux/arm64']);

const INDEX_MEDIA_TYPES = new Set([
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
]);

const OCI_DIGEST = /^sha256:[0-9a-f]{64}$/u;

/**
 * Validate the immutable index itself, not the architecture selected by the
 * runner's local "docker pull". Extra provenance/attestation descriptors with
 * unknown/unknown platforms are permitted but cannot satisfy the requirement.
 */
export function validateOciPlatforms(manifest, required = REQUIRED_PRODUCTION_PLATFORMS) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || !INDEX_MEDIA_TYPES.has(manifest.mediaType)) {
    return ['OCI multi-platform index is required (single-arch manifests are not deployable)'];
  }
  if (!Array.isArray(manifest.manifests) || manifest.manifests.length === 0) {
    return ['OCI index must contain platform descriptors'];
  }

  const counts = new Map();
  for (const entry of manifest.manifests) {
    if (!OCI_DIGEST.test(entry?.digest ?? '')) {
      errors.push('OCI index contains an invalid child digest');
      continue;
    }
    const os = entry?.platform?.os;
    const architecture = entry?.platform?.architecture;
    if (typeof os !== 'string' || typeof architecture !== 'string') {
      errors.push('OCI index contains an invalid platform descriptor');
      continue;
    }
    const key = `${os}/${architecture}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const platform of required) {
    if (counts.get(platform) !== 1) {
      errors.push(
        `OCI index requires exactly one ${platform} descriptor (found ${counts.get(platform) ?? 0})`,
      );
    }
  }
  return errors;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk.toString('utf8');
  const manifest = JSON.parse(raw);
  const errors = validateOciPlatforms(manifest);
  if (errors.length) throw new Error(errors.join('; '));
  process.stdout.write(`OCI_PLATFORMS=PASS ${REQUIRED_PRODUCTION_PLATFORMS.join(',')}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`OCI_PLATFORMS=FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
