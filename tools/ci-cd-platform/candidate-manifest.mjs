#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { digest as contentDigest } from './lib/contracts.mjs';

export const CANDIDATE_SET_SCHEMA = 'memoflow.candidate-set/v1';
export const CANDIDATE_COMPONENTS = Object.freeze(['web', 'api', 'migrator']);
export const CANDIDATE_DISTRIBUTIONS = Object.freeze(['china', 'global']);

const FULL_SHA = /^[0-9a-f]{40}$/u;
const OCI_DIGEST = /^sha256:[0-9a-f]{64}$/u;

const sha256 = (value) => `sha256:${contentDigest(value)}`;

export function candidateSetDigest(candidate) {
  const { digest: _digest, generatedAt: _generatedAt, ...identity } = candidate;
  return sha256(identity);
}

function validateImage(component, image, candidate, errors) {
  if (!image || typeof image !== 'object' || Array.isArray(image)) {
    errors.push(`missing image contract: ${component}`);
    return;
  }
  if (image.tag !== candidate.candidateTag) {
    errors.push(`${component}.tag must equal candidateTag`);
  }
  if (image.revision !== candidate.gitSha) {
    errors.push(`${component}.revision must equal gitSha`);
  }
  if (!OCI_DIGEST.test(image.digest ?? '')) {
    errors.push(`${component}.digest must be sha256:<64 hex>`);
  }
  const distributions = Object.keys(image.distributions ?? {}).sort();
  if (JSON.stringify(distributions) !== JSON.stringify([...CANDIDATE_DISTRIBUTIONS].sort())) {
    errors.push(
      `${component}.distributions must contain exactly: ${CANDIDATE_DISTRIBUTIONS.join(', ')}`,
    );
    return;
  }
  for (const name of CANDIDATE_DISTRIBUTIONS) {
    const distribution = image.distributions[name];
    if (!distribution || typeof distribution !== 'object') {
      errors.push(`${component}.distributions.${name} is required`);
      continue;
    }
    if (typeof distribution.repository !== 'string' || distribution.repository.length === 0) {
      errors.push(`${component}.distributions.${name}.repository is required`);
    }
    if (distribution.tag !== candidate.candidateTag) {
      errors.push(`${component}.distributions.${name}.tag must equal candidateTag`);
    }
    if (distribution.digest !== image.digest) {
      errors.push(`${component}.distributions.${name}.digest must equal image digest`);
    }
  }
}

export function validateCandidateSet(candidate) {
  const errors = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return ['candidate must be an object'];
  }
  if (candidate.schema !== CANDIDATE_SET_SCHEMA) {
    errors.push(`schema must be ${CANDIDATE_SET_SCHEMA}`);
  }
  if (!FULL_SHA.test(candidate.gitSha ?? '')) errors.push('gitSha must be a full Git SHA');
  if (!/^\d+$/u.test(String(candidate.ciRunId ?? ''))) errors.push('ciRunId must be numeric');
  if (candidate.candidateTag !== `sha-${candidate.gitSha}`) {
    errors.push('candidateTag must equal sha-<full gitSha>');
  }
  if (!OCI_DIGEST.test(candidate.deliveryManifestDigest ?? '')) {
    errors.push('deliveryManifestDigest must be sha256:<64 hex>');
  }

  const chain = candidate.ciEvidence;
  if (
    !chain ||
    chain.kind !== 'ci-chain-v1' ||
    chain.commit !== candidate.gitSha ||
    String(chain.ciRunId) !== String(candidate.ciRunId) ||
    `sha256:${chain.deliveryManifestDigest}` !== candidate.deliveryManifestDigest ||
    !FULL_SHA.test(chain.tree ?? '') ||
    !OCI_DIGEST.test(chain.buildArtifactDigest ?? '') ||
    !Number.isSafeInteger(chain.buildArtifactId) ||
    !FULL_SHA.test(chain.testEvidence?.testedCommit ?? '') ||
    chain.testEvidence?.testedTree !== chain.tree ||
    !/^\d+$/u.test(String(chain.testEvidence?.testRunId ?? ''))
  ) {
    errors.push('ciEvidence must bind tree, tests and build artifact to the source CI');
  }

  const imageKeys = Object.keys(candidate.images ?? {}).sort();
  if (JSON.stringify(imageKeys) !== JSON.stringify([...CANDIDATE_COMPONENTS].sort())) {
    errors.push(`images must contain exactly: ${CANDIDATE_COMPONENTS.join(', ')}`);
  }
  for (const component of CANDIDATE_COMPONENTS) {
    validateImage(component, candidate.images?.[component], candidate, errors);
  }

  const expected = candidateSetDigest(candidate);
  if (candidate.digest !== expected) errors.push(`candidate digest mismatch: expected ${expected}`);
  return errors;
}

export function createCandidateSet(input) {
  const candidate = {
    schema: CANDIDATE_SET_SCHEMA,
    gitSha: input.gitSha,
    ciRunId: String(input.ciRunId),
    candidateTag: `sha-${input.gitSha}`,
    deliveryManifestDigest: input.deliveryManifestDigest,
    ciEvidence: structuredClone(input.ciEvidence),
    images: structuredClone(input.images),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
  candidate.digest = candidateSetDigest(candidate);
  return candidate;
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
    const candidate = JSON.parse(await readFile(args.validate, 'utf8'));
    const errors = validateCandidateSet(candidate);
    if (errors.length > 0) throw new Error(errors.join('; '));
    console.log(`CANDIDATE_SET=PASS digest=${candidate.digest}`);
    return;
  }
  if (!args.input || !args.output) throw new Error('--input and --output are required');
  const input = JSON.parse(await readFile(args.input, 'utf8'));
  const candidate = createCandidateSet(input);
  const errors = validateCandidateSet(candidate);
  if (errors.length > 0) throw new Error(errors.join('; '));
  const output = path.resolve(args.output);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(candidate, null, 2)}\n`);
  console.log(`CANDIDATE_SET=PASS digest=${candidate.digest}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `candidate set failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
