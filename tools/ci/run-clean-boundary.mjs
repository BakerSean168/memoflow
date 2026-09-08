#!/usr/bin/env node

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workspace = resolve(process.cwd());
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker';
const worktree = mkdtempSync(join(tmpdir(), 'memoflow-boundary-'));
const archivePath = join(tmpdir(), `memoflow-boundary-${process.pid}.zip`);
const containerName = `memoflow-boundary-${process.pid}`;
const env = {
  ...process.env,
  CI: process.env.CI ?? 'true',
  DATABASE_URL: 'postgresql://test_user:test_pass@127.0.0.1:5433/memoflow_test',
  JWT_SECRET: 'clean-boundary-secret-not-for-production-use',
  TZ: 'UTC',
};

const stages = [
  {
    name: 'smoke',
    command: pnpmCommand,
    args: ['exec', 'nx', 'run', 'api:test:smoke'],
  },
  {
    name: 'integration',
    command: pnpmCommand,
    args: [
      'exec',
      'nx',
      'run-many',
      '-t',
      'test:integration',
      '--projects=task,goal,schedule,scheduler,reminder',
      '--parallel=1',
      '--outputStyle=static',
    ],
    database: true,
  },
  {
    name: 'ipc',
    command: pnpmCommand,
    args: ['exec', 'nx', 'run', 'desktop:test:ipc'],
  },
  {
    name: 'main-process',
    command: pnpmCommand,
    args: ['exec', 'nx', 'run', 'desktop:test:main'],
  },
];

function run(command, args, options = {}) {
  const rendered = [command, ...args].join(' ');
  console.log(`\n$ ${rendered}`);
  const useCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/iu.test(command);
  const spawnCommand = useCmdShim ? 'cmd.exe' : command;
  const spawnArgs = useCmdShim ? ['/d', '/s', '/c', command, ...args] : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: options.cwd ?? worktree,
    env: options.env ?? env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    console.error(`Unable to start command: ${result.error.message}`);
  }
  return {
    exitCode: typeof result.status === 'number' ? result.status : 1,
    rendered,
  };
}

function removeWorktree() {
  if (existsSync(worktree)) {
    rmSync(worktree, { recursive: true, force: true });
  }
  if (existsSync(archivePath)) {
    rmSync(archivePath, { force: true });
  }
}

function createCleanSource() {
  const archive = spawnSync('git', ['archive', '--format=zip', 'HEAD'], {
    cwd: workspace,
    encoding: 'buffer',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (archive.status !== 0 || !archive.stdout?.length) {
    throw new Error('Unable to create a clean source archive from HEAD.');
  }
  writeFileSync(archivePath, archive.stdout);
  const extraction = run(
    process.platform === 'win32' ? 'pwsh.exe' : 'unzip',
    process.platform === 'win32'
      ? [
          '-NoProfile',
          '-Command',
          `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${worktree.replaceAll("'", "''")}' -Force`,
        ]
      : ['-q', archivePath, '-d', worktree],
    { cwd: workspace },
  );
  if (extraction.exitCode !== 0) {
    throw new Error('Unable to extract the clean source archive.');
  }
}

function parseArgs(argv) {
  if (argv.includes('--help')) {
    return { dryRun: false, help: true };
  }
  return { dryRun: argv.includes('--dry-run'), help: false };
}

function preparePath() {
  const localBin = join(worktree, 'node_modules', '.bin');
  return [localBin, process.env.PATH].filter(Boolean).join(delimiter);
}

function startDatabase() {
  return run(
    dockerCommand,
    [
      'run',
      '-d',
      '--name',
      containerName,
      '-e',
      'POSTGRES_USER=test_user',
      '-e',
      'POSTGRES_PASSWORD=test_pass',
      '-e',
      'POSTGRES_DB=memoflow_test',
      '-p',
      '5433:5432',
      '--health-cmd',
      'pg_isready -U test_user -d memoflow_test',
      '--health-interval',
      '2s',
      '--health-timeout',
      '5s',
      '--health-retries',
      '30',
      'pgvector/pgvector:0.8.5-pg18',
    ],
    { cwd: workspace },
  );
}

function waitForDatabase() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = spawnSync(
      dockerCommand,
      ['inspect', '--format={{.State.Health.Status}}', containerName],
      { cwd: workspace, encoding: 'utf8' },
    );
    if (result.status === 0 && result.stdout.trim() === 'healthy') {
      console.log('Postgres is healthy.');
      return true;
    }
    spawnSync(
      process.platform === 'win32' ? 'ping.exe' : 'sleep',
      process.platform === 'win32' ? ['-n', '3', '127.0.0.1'] : ['2'],
      { stdio: 'ignore' },
    );
  }
  return false;
}

function stopDatabase() {
  run(dockerCommand, ['rm', '-f', containerName], { cwd: workspace });
}

async function main() {
  const { dryRun, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log('Usage: pnpm ci:boundary:clean [--dry-run]');
    removeWorktree();
    return;
  }
  const results = [];
  let databaseStarted = false;
  let result;

  try {
    console.log(`Creating clean source snapshot at ${worktree}`);
    createCleanSource();

    if (dryRun) {
      console.log('Dry run: dependency installation and test commands were not executed.');
      for (const stage of stages) {
        console.log(`planned ${stage.name}: ${stage.command} ${stage.args.join(' ')}`);
      }
      return;
    }

    env.PATH = preparePath();
    result = run(pnpmCommand, ['install', '--frozen-lockfile', '--reporter=append-only']);
    if (result.exitCode !== 0) {
      throw new Error('Dependency installation failed in clean worktree.');
    }

    for (const stage of stages) {
      if (stage.database) {
        const databaseResult = startDatabase();
        databaseStarted = databaseResult.exitCode === 0;
        if (databaseStarted && !waitForDatabase()) {
          console.error('Postgres failed to become healthy in time.');
          results.push({ name: 'database', exitCode: 1 });
          continue;
        }
        const schemaResult = run(pnpmCommand, ['exec', 'nx', 'run', 'database:prisma-push']);
        if (schemaResult.exitCode !== 0) {
          results.push({ name: 'integration schema', exitCode: schemaResult.exitCode });
          continue;
        }
      }

      result = run(stage.command, stage.args);
      results.push({ name: stage.name, exitCode: result.exitCode });
    }
  } finally {
    if (databaseStarted) {
      stopDatabase();
    }
    removeWorktree();
  }

  const failures = results.filter((entry) => entry.exitCode !== 0);
  console.log('\nClean Boundary summary:');
  for (const entry of results) {
    console.log(
      `- ${entry.name}: ${entry.exitCode === 0 ? 'passed' : `failed (${entry.exitCode})`}`,
    );
  }
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
