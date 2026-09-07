import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const manifestPath = resolve(root, 'tools/test/hard-7101-failure-matrix.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const runnerConfig = {
  'schedule-integration': {
    cwd: 'packages/schedule',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts'],
  },
  'scheduler-integration': {
    cwd: 'packages/scheduler',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts'],
  },
  'scheduler-unit': {
    cwd: 'packages/scheduler',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'],
  },
  'schedule-orchestration-unit': {
    cwd: 'packages/schedule-orchestration',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'],
  },
  'reminder-unit': {
    cwd: 'packages/reminder',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'],
  },
  'notification-unit': {
    cwd: 'packages/notification',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'],
  },
  'notification-integration': {
    cwd: 'packages/notification',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts'],
  },
  'api-integration': {
    cwd: 'apps/api',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts'],
  },
  'time-unit': {
    cwd: 'packages/time',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'],
  },
  'task-integration': {
    cwd: 'packages/task',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts'],
  },
  'task-unit': {
    cwd: 'packages/task',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'],
  },
  'goal-integration': {
    cwd: 'packages/goal',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.integration.config.ts'],
  },
  'app-vue-unit': {
    cwd: 'packages/app-vue',
    command: ['node', '../../node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts'],
  },
};

function fail(message) {
  console.error(`[hard-7101] ${message}`);
  process.exitCode = 1;
}

function checkManifest() {
  if (manifest.ticket !== 'HARD-7101') fail(`unexpected ticket ${manifest.ticket}`);
  if (!Array.isArray(manifest.scenarios) || manifest.scenarios.length !== 22) {
    fail(`expected exactly 22 scenarios, got ${manifest.scenarios?.length ?? 0}`);
    return false;
  }

  const ids = new Set();
  const names = new Set();
  for (const row of manifest.scenarios) {
    if (!row.id || ids.has(row.id)) fail(`duplicate or missing scenario id: ${row.id}`);
    ids.add(row.id);
    if (!row.scenario || names.has(row.scenario)) fail(`duplicate or missing scenario name: ${row.scenario}`);
    names.add(row.scenario);
    if (!Array.isArray(row.evidence) || row.evidence.length === 0) {
      fail(`${row.id} has no behavior-test evidence`);
      continue;
    }
    for (const evidence of row.evidence) {
      const absolute = resolve(root, evidence.file);
      let source;
      try {
        source = readFileSync(absolute, 'utf8');
      } catch {
        fail(`${row.id} evidence file is missing: ${evidence.file}`);
        continue;
      }
      if (!source.includes(evidence.title)) {
        fail(`${row.id} evidence title drifted: ${evidence.title} (${evidence.file})`);
      }
      if (evidence.runner !== 'desktop-e2e' && !runnerConfig[evidence.runner]) {
        fail(`${row.id} uses unknown runner: ${evidence.runner}`);
      }
    }
  }

  if (process.exitCode) return false;
  console.log(`[hard-7101] check passed: ${manifest.scenarios.length}/22 scenarios bound to behavior tests.`);
  return true;
}

function runCommand(command, cwd) {
  const [bin, ...args] = command;
  console.log(`\n[hard-7101] RUN (${cwd}) ${[bin, ...args].join(' ')}`);
  const result = spawnSync(bin, args, {
    cwd: resolve(root, cwd),
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`runner failed with exit ${result.status}: ${[bin, ...args].join(' ')}`);
  }
}

function runMatrix({ skipE2e }) {
  const grouped = new Map();
  for (const row of manifest.scenarios) {
    for (const evidence of row.evidence) {
      if (evidence.runner === 'desktop-e2e') continue;
      const config = runnerConfig[evidence.runner];
      const files = grouped.get(evidence.runner) ?? new Set();
      files.add(relative(resolve(root, config.cwd), resolve(root, evidence.file)).replaceAll('\\', '/'));
      grouped.set(evidence.runner, files);
    }
  }

  for (const [runner, files] of grouped) {
    const config = runnerConfig[runner];
    runCommand([...config.command, ...[...files].sort()], config.cwd);
  }

  if (!skipE2e) {
    const desktop = manifest.scenarios.find((row) => row.id === 'desktop-restart').evidence[0];
    if (process.platform === 'linux') {
      runCommand(
        [
          'bash',
          'apps/desktop/scripts/run-linux-electron-e2e-with-keyring.sh',
          'e2e/authentication/desktop-auth-flow.spec.ts',
          '--grep',
          desktop.title,
        ],
        '.',
      );
    } else {
      runCommand(
        [
          'pnpm',
          'nx',
          'run',
          'desktop:e2e',
          '--',
          'e2e/authentication/desktop-auth-flow.spec.ts',
          '--grep',
          desktop.title,
        ],
        '.',
      );
    }
  }

  const passedScenarios = skipE2e ? manifest.scenarios.length - 1 : manifest.scenarios.length;
  console.log(`\n[hard-7101] run passed: ${passedScenarios}/22 failure scenarios${skipE2e ? ' (Desktop E2E skipped)' : ''}.`);
}

const args = new Set(process.argv.slice(2));
const shouldRun = args.has('--run');
const skipE2e = args.has('--skip-e2e');

if (checkManifest() && shouldRun) {
  try {
    runMatrix({ skipE2e });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
