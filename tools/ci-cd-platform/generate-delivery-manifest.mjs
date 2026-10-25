#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import {
  buildProvenance,
  digest,
  validateDeliveryManifest,
  contractRoutedProjects,
} from './lib/contracts.mjs';
import { classifyRisk, selectLanes } from './lib/risk.mjs';
import { buildLaneDetails } from './lib/lane-details.mjs';
import { detectScope } from './lib/scope-detector.mjs';

import { planUnitShards, unitJobEnabled } from './lib/unit-shards.mjs';

// eslint-disable-next-line @nx/enforce-module-boundaries -- CI CLI consumes the source-only test-system planner
import { planWebShards, selectWebSpecs } from '../test-system-v2/lib/web-shards.mjs';

const exec = promisify(execFile);

async function changedFiles({ root, base, head, full }) {
  if (full || !base || !head) return [];
  const { stdout } = await exec(
    'git',
    ['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${base}...${head}`],
    {
      cwd: root,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  return stdout
    .split(/\r?\n/u)
    .map((file) => file.trim())
    .filter(Boolean)
    .sort();
}

export async function buildDeliveryManifest({
  root = process.cwd(),
  base = process.env.NX_BASE ?? null,
  head = process.env.NX_HEAD ?? process.env.GITHUB_SHA ?? null,
  event = process.env.GITHUB_EVENT_NAME ?? 'pull_request',
  ref = process.env.GITHUB_REF ?? null,
  full,
  scope,
  files,
} = {}) {
  // An injected scope is authoritative: ambient CI env (e.g. a push to
  // main) must not silently override its full flag, or the manifest
  // becomes internally inconsistent (scope.full !== manifest.full).
  const resolvedFull =
    full ??
    scope?.full ??
    (event === 'schedule' ||
      event === 'workflow_dispatch' ||
      (event === 'push' && ref === 'refs/heads/main'));
  const changed = files ?? (await changedFiles({ root, base, head, full: resolvedFull }));
  const resolvedScope =
    scope ?? (await detectScope({ root, base, head, full: resolvedFull, files: changed }));
  const risk = classifyRisk(changed);
  const forcedLanes = (process.env.DELIVERY_FORCE_LANES ?? '')
    .split(',')
    .map((lane) => lane.trim())
    .filter(Boolean);
  const effectiveFull = resolvedFull || resolvedScope.full === true;
  const selectedLanes = selectLanes({ risk, scope: resolvedScope, event, full: effectiveFull });
  for (const lane of forcedLanes) selectedLanes[lane] = true;
  const history = JSON.parse(
    await readFile(path.join(root, 'tools/test-system-v2/web-spec-durations.json'), 'utf8'),
  );
  const selection = selectWebSpecs({
    enabled: selectedLanes.web,
    full: effectiveFull,
    files: changed,
  });
  const webShards = planWebShards({ ...selection, durations: history.specs });
  selectedLanes.web = webShards.shardCount > 0;
  const input = {
    base,
    head,
    event,
    ref,
    full: effectiveFull,
    changedFiles: changed,
    scope: resolvedScope,
    risk,
  };
  const laneDetails = buildLaneDetails({
    lanes: selectedLanes,
    changedFiles: changed,
    scope: resolvedScope,
    full: effectiveFull,
  });
  // Q4/T2: contract-routed projects leave the Unit shards (see
  // contractRoutedProjects in lib/lane-details.mjs).
  const routed = contractRoutedProjects({ scope: resolvedScope, laneDetails });
  const shardUnitProjects =
    routed.length > 0
      ? resolvedScope.unit.filter((project) => !routed.includes(project))
      : resolvedScope.unit;
  const manifest = {
    kind: 'delivery-manifest-v1',
    version: 1,
    commit: head ?? 'local',
    base,
    head,
    event,
    full: effectiveFull,
    changedFiles: changed,
    risk,
    scope: resolvedScope,
    laneDetails,
    // Unit shards always run the plain test target; coverage measurement is
    // nightly-audit-only and never re-weighs or de-splits the CI plan.
    unitShards: planUnitShards(shardUnitProjects),
    webShards,
    lanes: selectedLanes,
    provenance: buildProvenance({
      generator: 'ci-cd-platform-v2/generate-delivery-manifest@1',
      input,
    }),
  };
  const result = { ...manifest, digest: digest(manifest) };
  validateDeliveryManifest(result);
  return result;
}

export async function writeManifestOutputs(manifest, output) {
  if (process.env.GITHUB_OUTPUT) {
    const lines = [
      `web_matrix=${JSON.stringify({ shard: manifest.lanes.web ? manifest.webShards.shards.map(({ id }) => id) : [] })}`,
      `web_specs=${JSON.stringify(manifest.webShards.specs)}`,
      `web_estimated_total_ms=${manifest.webShards.estimatedTotalMs}`,
      `manifest_path=${output}`,
      `manifest_digest=${manifest.digest}`,
      `risk=${manifest.risk.level}`,
      `capability_fmt=${manifest.laneDetails?.fmt?.required ?? false}`,
      `capability_component_browser=${manifest.laneDetails?.componentBrowser?.required ?? false}`,
      `capability_contract=${manifest.laneDetails?.contract?.required ?? false}`,
      ...Object.entries(manifest.lanes).map(([lane, enabled]) => `lane_${lane}=${enabled}`),
      ...manifest.unitShards.map(
        ({ id }) => `${id.replaceAll('-', '_')}=${unitJobEnabled(manifest, id)}`,
      ),
      `unit=${manifest.scope.unit.join(',')}`,
      `coverage=${manifest.scope.coverage.join(',')}`,
      `smoke=${manifest.scope.smoke.join(',')}`,
      `integration=${manifest.scope.integration.join(',')}`,
      `boundary=${manifest.scope.boundary.join(',')}`,
      `has_unit=${manifest.scope.unit.length > 0}`,
      `has_coverage=${manifest.scope.coverage.length > 0}`,
      `has_smoke=${manifest.scope.smoke.length > 0}`,
      `has_integration=${manifest.scope.integration.length > 0}`,
      `has_boundary=${manifest.scope.boundary.length > 0 || manifest.scope.smoke.length > 0}`,
      `has_desktop_boundary=${manifest.scope.boundary.length > 0}`,
      `has_perf=${manifest.scope.perf.length > 0}`,
      `has_web_flow=${manifest.scope.webFlow}`,
    ];
    await writeFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, { flag: 'a' });
  }
}

async function main() {
  const output = path.resolve(
    process.env.DELIVERY_MANIFEST_OUTPUT ?? 'scope/delivery-manifest-v1.json',
  );
  const manifest = await buildDeliveryManifest();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeManifestOutputs(manifest, output);
  console.log(
    JSON.stringify(
      { path: output, digest: manifest.digest, risk: manifest.risk, lanes: manifest.lanes },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[delivery-manifest] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
