#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildLaneInput,
  digest,
  validateDeliveryManifest,
  validateLaneInput,
} from './lib/contracts.mjs';
import { getLaneDefinition } from './lib/registry.mjs';

export async function createLaneInput({ lane, manifest, output, runId = null }) {
  const definition = getLaneDefinition(lane);
  validateDeliveryManifest(manifest);
  const buildOnly =
    lane === 'validate' &&
    manifest.execution?.mode === 'reuse' &&
    manifest.execution.candidate === true;
  if (manifest.lanes[lane] !== true && !buildOnly) {
    throw new Error(`Lane ${lane} is not enabled by delivery manifest ${manifest.digest}`);
  }
  const input = buildLaneInput({
    lane,
    commit: manifest.commit,
    manifestDigest: manifest.digest,
    definition,
    scope: manifest.scope,
    risk: manifest.risk,
    runId,
    policy: {
      event: manifest.event,
      risk: manifest.risk.level,
      full: manifest.full,
      execution: buildOnly ? 'build-only' : 'verification',
    },
  });
  input.digest = digest(input);
  validateLaneInput(input);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(input, null, 2)}\n`);
  return input;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index].replace(/^--/u, ''), process.argv[index + 1]);
  }
  const lane = args.get('lane');
  const manifestPath = path.resolve(args.get('manifest') ?? 'scope/delivery-manifest-v1.json');
  const output = path.resolve(
    args.get('output') ?? `reports/ci-cd-platform/${lane ?? 'lane'}-input-v1.json`,
  );
  if (!lane) throw new Error('--lane is required');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const input = await createLaneInput({
    lane,
    manifest,
    output,
    runId: process.env.GITHUB_RUN_ID ?? null,
  });
  console.log(JSON.stringify({ path: output, digest: input.digest, lane }, null, 2));
}
