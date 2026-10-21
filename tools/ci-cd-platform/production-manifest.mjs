#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateCandidateSet } from './candidate-manifest.mjs';
import { digest as contentDigest } from './lib/contracts.mjs';

export const PRODUCTION_SET_SCHEMA = 'memoflow.production-set/v1';
export const PRODUCTION_COMPONENTS = Object.freeze(['web', 'api', 'migrator']);
export const PRODUCTION_RUNTIME_IMAGES = Object.freeze(['postgres', 'redis', 'caddy', 'powersync']);

const FULL_SHA = /^[0-9a-f]{40}$/u;
const OCI_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const sha256 = (value) => `sha256:${contentDigest(value)}`;

export function productionSetDigest(productionSet) {
  const { digest: _digest, ...identity } = productionSet;
  return sha256(identity);
}

function requireReleaseIdentity(release, candidate) {
  const errors = [];
  if (release?.schemaVersion !== 2 || release?.kind !== 'memoflow-release') {
    errors.push('release manifest must be memoflow-release schemaVersion 2');
  }
  if (!FULL_SHA.test(release?.gitSha ?? '')) errors.push('release gitSha must be a full Git SHA');
  if (release?.gitSha !== candidate.gitSha)
    errors.push('release gitSha must equal candidate gitSha');
  if (Number(release?.ciRunId) !== Number(candidate.ciRunId)) {
    errors.push('release ciRunId must equal candidate ciRunId');
  }
  if (release?.candidateSet?.digest !== candidate.digest) {
    errors.push('release candidateSet digest must equal candidate digest');
  }
  if (release?.deliveryManifestDigest !== candidate.deliveryManifestDigest) {
    errors.push('release deliveryManifestDigest must equal candidate delivery manifest digest');
  }
  for (const component of PRODUCTION_COMPONENTS) {
    const expected = candidate.images?.[component];
    const actual = release?.docker?.images?.[component];
    if (actual?.digest !== expected?.digest) {
      errors.push(`release ${component} digest must equal candidate digest`);
    }
    if (
      actual?.distributions?.china?.repository !== expected?.distributions?.china?.repository ||
      actual?.distributions?.china?.digest !== expected?.digest
    ) {
      errors.push(`release ${component} China distribution must equal candidate distribution`);
    }
  }
  return errors;
}

function runtimeImageMap(mirrorConfig, registry, namespace, errors) {
  const result = {};
  if (mirrorConfig?.schemaVersion !== 2)
    errors.push('runtime mirrors must use multi-arch schemaVersion 2');
  for (const runtime of PRODUCTION_RUNTIME_IMAGES) {
    const name = `memoflow-${runtime}`;
    const mirror = mirrorConfig?.images?.find((entry) => entry.name === name);
    if (!mirror) {
      errors.push(`missing runtime mirror: ${name}`);
      continue;
    }
    const digest = String(mirror.source ?? '').split('@')[1] ?? '';
    if (!OCI_DIGEST.test(digest)) errors.push(`${name} source must be digest-pinned`);
    if (JSON.stringify(mirror.platforms) !== JSON.stringify(['linux/amd64', 'linux/arm64'])) {
      errors.push(`${name} must pin linux/amd64 and linux/arm64`);
    }
    if (!String(mirror.tag ?? '').endsWith(digest.replace('sha256:', '').slice(0, 12))) {
      errors.push(`${name} tag must bind digest prefix`);
    }
    result[runtime] = {
      repository: `${registry}/${namespace}/${name}`,
      tag: mirror.tag,
      digest,
    };
  }
  return result;
}

export function createProductionSet({
  release,
  candidate,
  mirrorConfig,
  registry,
  namespace,
  controlPlaneSha,
}) {
  const candidateErrors = validateCandidateSet(candidate);
  if (candidateErrors.length > 0) {
    throw new Error(`invalid candidate-set: ${candidateErrors.join('; ')}`);
  }
  const errors = requireReleaseIdentity(release, candidate);
  if (!registry || !namespace) errors.push('production registry and namespace are required');
  if (!FULL_SHA.test(controlPlaneSha ?? '')) errors.push('controlPlaneSha must be a full Git SHA');
  const runtime = runtimeImageMap(mirrorConfig, registry, namespace, errors);
  if (errors.length > 0) throw new Error(errors.join('; '));

  const images = Object.fromEntries(
    PRODUCTION_COMPONENTS.map((component) => {
      const source = release.docker.images[component].distributions.china;
      const expectedRepository = `${registry}/${namespace}/memoflow-${component}`;
      if (source.repository !== expectedRepository) {
        throw new Error(
          `${component} China repository mismatch: ${source.repository} != ${expectedRepository}`,
        );
      }
      return [
        component,
        {
          repository: source.repository,
          releaseTag: release.tag,
          digest: source.digest,
        },
      ];
    }),
  );

  const productionSet = {
    schema: PRODUCTION_SET_SCHEMA,
    releaseTag: release.tag,
    version: release.version,
    gitSha: release.gitSha,
    ciRunId: String(release.ciRunId),
    controlPlaneSha,
    releaseManifestDigest: sha256(release),
    candidateSetDigest: candidate.digest,
    candidateTag: candidate.candidateTag,
    deliveryManifestDigest: candidate.deliveryManifestDigest,
    images,
    runtime,
  };
  productionSet.digest = productionSetDigest(productionSet);
  return productionSet;
}

export function validateProductionSet(productionSet) {
  const errors = [];
  if (!productionSet || typeof productionSet !== 'object' || Array.isArray(productionSet)) {
    return ['production set must be an object'];
  }
  const expectedKeys = [
    'candidateSetDigest',
    'candidateTag',
    'ciRunId',
    'controlPlaneSha',
    'deliveryManifestDigest',
    'digest',
    'gitSha',
    'images',
    'releaseManifestDigest',
    'releaseTag',
    'runtime',
    'schema',
    'version',
  ].sort();
  const actualKeys = Object.keys(productionSet).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    errors.push(`production set fields must be exactly: ${expectedKeys.join(', ')}`);
  }
  if (productionSet.schema !== PRODUCTION_SET_SCHEMA) {
    errors.push(`schema must be ${PRODUCTION_SET_SCHEMA}`);
  }
  if (!FULL_SHA.test(productionSet.gitSha ?? '')) errors.push('gitSha must be a full Git SHA');
  if (!FULL_SHA.test(productionSet.controlPlaneSha ?? ''))
    errors.push('controlPlaneSha must be a full Git SHA');
  if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(productionSet.releaseTag ?? '')) {
    errors.push('releaseTag must be an immutable semver tag');
  }
  if (productionSet.version !== String(productionSet.releaseTag ?? '').replace(/^v/u, '')) {
    errors.push('version must equal releaseTag without the v prefix');
  }
  if (productionSet.candidateTag !== `sha-${productionSet.gitSha}`) {
    errors.push('candidateTag must equal sha-<gitSha>');
  }
  if (!/^\d+$/u.test(String(productionSet.ciRunId ?? ''))) errors.push('ciRunId must be numeric');
  for (const field of ['releaseManifestDigest', 'candidateSetDigest', 'deliveryManifestDigest']) {
    if (!OCI_DIGEST.test(productionSet[field] ?? ''))
      errors.push(`${field} must be sha256:<64 hex>`);
  }
  const imageKeys = Object.keys(productionSet.images ?? {}).sort();
  if (JSON.stringify(imageKeys) !== JSON.stringify([...PRODUCTION_COMPONENTS].sort())) {
    errors.push(`images must contain exactly: ${PRODUCTION_COMPONENTS.join(', ')}`);
  }
  for (const component of PRODUCTION_COMPONENTS) {
    const image = productionSet.images?.[component];
    if (!image?.repository) errors.push(`${component}.repository is required`);
    if (image?.releaseTag !== productionSet.releaseTag) {
      errors.push(`${component}.releaseTag must equal releaseTag`);
    }
    if (!OCI_DIGEST.test(image?.digest ?? ''))
      errors.push(`${component}.digest must be sha256:<64 hex>`);
  }
  const runtimeKeys = Object.keys(productionSet.runtime ?? {}).sort();
  if (JSON.stringify(runtimeKeys) !== JSON.stringify([...PRODUCTION_RUNTIME_IMAGES].sort())) {
    errors.push(`runtime must contain exactly: ${PRODUCTION_RUNTIME_IMAGES.join(', ')}`);
  }
  for (const name of PRODUCTION_RUNTIME_IMAGES) {
    const image = productionSet.runtime?.[name];
    if (!image?.repository || !image?.tag)
      errors.push(`runtime.${name} repository/tag are required`);
    if (!OCI_DIGEST.test(image?.digest ?? '')) {
      errors.push(`runtime.${name}.digest must be sha256:<64 hex>`);
    } else if (
      !String(image?.tag ?? '').endsWith(
        image.digest.slice('sha256:'.length, 'sha256:'.length + 12),
      )
    ) {
      errors.push(`runtime.${name}.tag must bind digest prefix`);
    }
  }
  const expected = productionSetDigest(productionSet);
  if (productionSet.digest !== expected)
    errors.push(`production set digest mismatch: expected ${expected}`);
  return errors;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    args[key] = value;
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.validate) {
    const productionSet = JSON.parse(await readFile(args.validate, 'utf8'));
    const errors = validateProductionSet(productionSet);
    if (errors.length > 0) throw new Error(errors.join('; '));
    console.log(`PRODUCTION_SET=PASS digest=${productionSet.digest}`);
    return;
  }
  for (const key of [
    'release',
    'candidate',
    'runtime-mirrors',
    'registry',
    'namespace',
    'control-plane-sha',
    'output',
  ]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  const [release, candidate, mirrorConfig] = await Promise.all([
    readFile(args.release, 'utf8').then(JSON.parse),
    readFile(args.candidate, 'utf8').then(JSON.parse),
    readFile(args['runtime-mirrors'], 'utf8').then(JSON.parse),
  ]);
  const productionSet = createProductionSet({
    release,
    candidate,
    mirrorConfig,
    registry: args.registry,
    namespace: args.namespace,
    controlPlaneSha: args['control-plane-sha'],
  });
  const errors = validateProductionSet(productionSet);
  if (errors.length > 0) throw new Error(errors.join('; '));
  const output = path.resolve(args.output);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(productionSet, null, 2)}\n`);
  console.log(`PRODUCTION_SET=PASS digest=${productionSet.digest}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `production set failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
