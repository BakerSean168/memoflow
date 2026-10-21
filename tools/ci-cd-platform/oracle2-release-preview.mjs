#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  releaseImageRefs,
  renderOracle2ComposeCandidate,
  renderOracle2EnvCandidate,
  assertOracle2ComposeCandidate,
} from './oracle2-compose-candidate.mjs';

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const FULL_SHA = /^[0-9a-f]{40}$/u;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (
      ![
        '--production-set',
        '--compose',
        '--env-file',
        '--set-sha256',
        '--set-digest',
        '--release-sha',
      ].includes(name) ||
      !value ||
      name in args
    ) {
      throw new Error('invalid Oracle2 release preview arguments');
    }
    args[name] = value;
  }
  if (Object.keys(args).length !== 6) {
    throw new Error(
      'required: --production-set --compose --env-file --set-sha256 --set-digest --release-sha',
    );
  }
  if (
    !DIGEST.test(args['--set-sha256']) ||
    !DIGEST.test(args['--set-digest']) ||
    !FULL_SHA.test(args['--release-sha'])
  ) {
    throw new Error('invalid selected control artifact identity');
  }
  return args;
}

function resolveConfig(projectDir, composeFile, envFile) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '-p',
      'memoflow-oracle2',
      '--project-directory',
      projectDir,
      '-f',
      composeFile,
      '--env-file',
      envFile,
      'config',
      '--format',
      'json',
    ],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.status !== 0) throw new Error('Docker Compose candidate config failed');
  return JSON.parse(result.stdout);
}

function requiredEnv(text, key) {
  const values = [...text.matchAll(new RegExp('^' + key + '=(.*)$', 'gm'))];
  if (values.length !== 1) throw new Error('expected exactly one production ' + key);
  return values[0][1].replace(/^['"]|['"]$/gu, '');
}

function assertNotDowngrade(current, incoming) {
  const numeric = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/u.exec(value);
    if (!match) throw new Error('invalid current or incoming application version');
    return match.slice(1).map(Number);
  };
  const before = numeric(current);
  const after = numeric(incoming);
  for (let i = 0; i < before.length; i += 1) {
    if (after[i] < before[i])
      throw new Error('production release downgrade requires recovery approval');
    if (after[i] > before[i]) break;
  }
}

export function oracle2ReleasePreview({
  manifestText,
  currentCompose,
  currentEnv,
  expectedRawHash,
  expectedSetDigest,
  releaseSha,
  before,
  after,
}) {
  const calculated = 'sha256:' + createHash('sha256').update(manifestText).digest('hex');
  if (calculated !== expectedRawHash) throw new Error('production-set raw OCI checksum mismatch');
  const productionSet = JSON.parse(manifestText);
  if (productionSet.digest !== expectedSetDigest || productionSet.gitSha !== releaseSha) {
    throw new Error('selected release identity mismatch');
  }
  const registry = requiredEnv(currentEnv, 'REGISTRY');
  const namespace = requiredEnv(currentEnv, 'IMAGE_NAMESPACE');
  const { images, version } = releaseImageRefs(productionSet, registry, namespace);
  assertNotDowngrade(requiredEnv(currentEnv, 'APP_VERSION'), version);
  const candidateCompose = renderOracle2ComposeCandidate(currentCompose, images);
  const candidateEnv = renderOracle2EnvCandidate(currentEnv, version);
  if (before && after) {
    assertOracle2ComposeCandidate(before, after, images, version);
  }
  return {
    releaseTag: productionSet.releaseTag,
    releaseSha,
    images,
    version,
    candidateCompose,
    candidateEnv,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const composeFile = path.resolve(args['--compose']);
  const envFile = path.resolve(args['--env-file']);
  const currentCompose = fs.readFileSync(composeFile, 'utf8');
  const currentEnv = fs.readFileSync(envFile, 'utf8');
  const manifestText = fs.readFileSync(args['--production-set'], 'utf8');
  const fields = {
    manifestText,
    currentCompose,
    currentEnv,
    expectedRawHash: args['--set-sha256'],
    expectedSetDigest: args['--set-digest'],
    releaseSha: args['--release-sha'],
  };
  const plan = oracle2ReleasePreview(fields);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-oracle2-preview-'));
  try {
    fs.chmodSync(scratch, 0o700);
    const composeCandidate = path.join(scratch, 'compose.yaml');
    const envCandidate = path.join(scratch, 'production.env');
    fs.writeFileSync(composeCandidate, plan.candidateCompose, { mode: 0o600 });
    fs.writeFileSync(envCandidate, plan.candidateEnv, { mode: 0o600 });
    oracle2ReleasePreview({
      ...fields,
      before: resolveConfig(path.dirname(composeFile), composeFile, envFile),
      after: resolveConfig(path.dirname(composeFile), composeCandidate, envCandidate),
    });
    console.log(
      'ORACLE2_RELEASE_PREVIEW=PASS release=' + plan.releaseTag + ' source=' + plan.releaseSha,
    );
    console.log('ONLY_CHANGED=api,web,migrator images and api.APP_VERSION');
    console.log('SHARED_CADDY_AND_DATASTORE=UNCHANGED');
    console.log('ROLL_OUT=NOT_STARTED');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('ORACLE2_RELEASE_PREVIEW=FAIL ' + error.message);
    process.exitCode = 1;
  });
}
