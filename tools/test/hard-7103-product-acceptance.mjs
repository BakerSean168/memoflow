#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const manifestPath = resolve(root, 'tools/test/hard-7103-product-acceptance.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const fixtureIds = [...'ABCDEFGHIJ'];

const focusedRunners = {
  'task-unit': { cwd: 'packages/task', command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'] },
  'task-integration': { cwd: 'packages/task', command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts'] },
  'goal-unit': { cwd: 'packages/goal', command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'] },
  'goal-integration': { cwd: 'packages/goal', command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts'] },
  'orchestration-unit': { cwd: 'packages/schedule-orchestration', command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'] },
  'reminder-unit': { cwd: 'packages/reminder', command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'] },
  'reminder-integration': { cwd: 'packages/reminder', command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts'] },
  'notification-unit': { cwd: 'packages/notification', command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'] },
  'app-vue-unit': { cwd: 'packages/app-vue', command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'] },
};

function fail(message) {
  console.error(`[hard-7103] ${message}`);
  process.exitCode = 1;
}

function sourceContains(evidence, context) {
  const absolute = resolve(root, evidence.file);
  let source;
  try {
    source = readFileSync(absolute, 'utf8');
  } catch {
    fail(`${context}: missing evidence file ${evidence.file}`);
    return;
  }
  if (evidence.title != null && !source.includes(evidence.title)) {
    fail(`${context}: evidence title drifted: ${evidence.title} (${evidence.file})`);
  }
}

function checkManifest() {
  if (manifest.ticket !== 'HARD-7103') fail(`unexpected ticket ${manifest.ticket}`);
  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length !== 10) {
    fail(`expected 10 frozen fixtures, got ${manifest.fixtures?.length ?? 0}`);
    return false;
  }
  const ids = manifest.fixtures.map((fixture) => fixture.id);
  if (JSON.stringify(ids) !== JSON.stringify(fixtureIds)) {
    fail(`fixtures must be exactly A-J in order, got ${ids.join(',')}`);
  }
  for (const fixture of manifest.fixtures) {
    if (!fixture.scenario?.trim()) fail(`Fixture ${fixture.id} has no scenario`);
    if (!Array.isArray(fixture.focused) || fixture.focused.length === 0) {
      fail(`Fixture ${fixture.id} has no focused behavior evidence`);
      continue;
    }
    for (const evidence of fixture.focused) {
      if (!focusedRunners[evidence.runner]) fail(`Fixture ${fixture.id}: unknown focused runner ${evidence.runner}`);
      sourceContains(evidence, `Fixture ${fixture.id}`);
    }
  }

  const requiredLayers = ['api', 'desktop', 'web', 'localDocker', 'schemaBoot'];
  for (const layerName of requiredLayers) {
    const layer = manifest.layers?.[layerName];
    if (!layer) {
      fail(`missing host layer ${layerName}`);
      continue;
    }
    const covered = new Set(layer.covered ?? []);
    if (covered.size === 0) fail(`${layerName}: no covered fixture`);
    for (const id of covered) if (!fixtureIds.includes(id)) fail(`${layerName}: unknown covered fixture ${id}`);
    for (const id of fixtureIds) {
      if (covered.has(id)) continue;
      const reason = layer.notApplicable?.[id];
      if (typeof reason !== 'string' || reason.trim().length < 20) {
        fail(`${layerName}: Fixture ${id} is neither covered nor justified N/A`);
      }
    }
    for (const evidence of layer.evidence ?? []) {
      if (evidence.fixture !== '*' && !covered.has(evidence.fixture)) {
        fail(`${layerName}: evidence references uncovered Fixture ${evidence.fixture}`);
      }
      sourceContains(evidence, `${layerName}/${evidence.fixture}`);
    }
  }

  if (!process.exitCode) {
    console.log('[hard-7103] check passed: fixtures A-J have focused evidence and all five host layers have explicit covered/N/A truth.');
    return true;
  }
  return false;
}

function runCommand(command, cwd = '.') {
  const [bin, ...args] = command;
  console.log(`\n[hard-7103] RUN (${cwd}) ${[bin, ...args].join(' ')}`);
  const result = spawnSync(bin, args, {
    cwd: resolve(root, cwd),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`runner failed with exit ${result.status}: ${[bin, ...args].join(' ')}`);
}

function runFocused() {
  const grouped = new Map();
  for (const fixture of manifest.fixtures) {
    for (const evidence of fixture.focused) {
      const config = focusedRunners[evidence.runner];
      const files = grouped.get(evidence.runner) ?? new Set();
      files.add(relative(resolve(root, config.cwd), resolve(root, evidence.file)).replaceAll('\\', '/'));
      grouped.set(evidence.runner, files);
    }
  }
  for (const [runner, files] of grouped) {
    const config = focusedRunners[runner];
    runCommand([...config.command, ...[...files].sort()], config.cwd);
  }
  console.log('\n[hard-7103] focused passed: A-J behavior fixtures executed.');
}

function runApi() {
  runCommand([
    'node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts',
    'src/__tests__/integration/task-goal-host-restart.integration.test.ts',
  ], 'apps/api');
  console.log('\n[hard-7103] api passed: Fixture B host-restart journey executed.');
}

function runDesktop() {
  runCommand([
    'node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts',
    'src/main/modules/routine/windows-idle-sensor.adapter.spec.ts',
    'src/main/modules/routine/focus-window-controller.spec.ts',
  ], 'apps/desktop');
  console.log('\n[hard-7103] desktop passed: Fixtures G/H host seams executed.');
}

function runWeb() {
  runCommand([
    'node', '../../node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.config.ts',
    'e2e/task/task-completion-loop.spec.ts',
    'e2e/schedule/planner-task-revert.spec.ts',
  ], 'apps/web');
  console.log('\n[hard-7103] web passed: Fixtures B/J browser journeys executed.');
}

function runLocalDocker() {
  runCommand([
    'node', 'e2e/helpers/run-local-docker-playwright.mjs',
    'e2e/local-docker/core-product-phase-a.spec.ts',
    'e2e/local-docker/core-product-phase-b.spec.ts',
    'e2e/local-docker/core-product-phase-c.spec.ts',
    'e2e/local-docker/core-product-phase-d.spec.ts',
    'e2e/local-docker/core-product-phase-e.spec.ts',
  ], 'apps/web');
  console.log('\n[hard-7103] local Docker passed: current-revision product phases A-E executed with browser/container evidence.');
}

function runSchemaBoot() {
  runCommand(['node', 'tools/test/hard-7103-schema-boot.mjs']);
  console.log('\n[hard-7103] schema boot passed: A-J physical schema cold-start gate executed.');
}

const args = new Set(process.argv.slice(2));
if (!checkManifest()) process.exit(1);
if (args.has('--check') && args.size === 1) process.exit(0);

const layers = [];
for (const arg of args) {
  if (arg.startsWith('--layer=')) layers.push(arg.slice('--layer='.length));
}
if (args.has('--run')) layers.push('focused', 'api', 'desktop', 'web', 'localDocker', 'schemaBoot');

const actions = { focused: runFocused, api: runApi, desktop: runDesktop, web: runWeb, localDocker: runLocalDocker, schemaBoot: runSchemaBoot };
try {
  for (const layer of [...new Set(layers)]) {
    const action = actions[layer];
    if (!action) throw new Error(`unknown acceptance layer: ${layer}`);
    action();
  }
  if (layers.length > 0) console.log('\n[hard-7103] requested acceptance layers passed.');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
