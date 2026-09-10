import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

type Command = {
  executable: string;
  args: string[];
  cwd: string;
  label: string;
};

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL && env.DATABASE_URL !== 'undefined') {
    return env.DATABASE_URL;
  }
  if (!env.DB_HOST) {
    throw new Error('DATABASE_URL or DB_HOST must be set before running the migrator');
  }

  const username = encodeURIComponent(env.DB_USER || 'memoflow');
  const password = env.DB_PASSWORD ? `:${encodeURIComponent(env.DB_PASSWORD)}` : '';
  const port = env.DB_PORT || '5432';
  const database = encodeURIComponent(env.DB_NAME || 'memoflow');
  return `postgresql://${username}${password}@${env.DB_HOST}:${port}/${database}?schema=public`;
}

export function hasPrismaMigrations(migrationsDir: string): boolean {
  if (!existsSync(migrationsDir)) {
    return false;
  }

  return readdirSync(migrationsDir, { withFileTypes: true }).some(
    (entry) =>
      entry.isDirectory() && existsSync(resolve(migrationsDir, entry.name, 'migration.sql')),
  );
}

function run(command: Command): void {
  console.log(`[migrator] ${command.label}`);
  const result = spawnSync(command.executable, command.args, {
    cwd: command.cwd,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`${command.label} failed with exit code ${result.status ?? 1}`);
  }
}

export function createMigrationCommands(workspaceRoot: string): Command[] {
  const databaseRoot = resolve(workspaceRoot, 'node_modules/@memoflow/database');
  const runtimeScripts = resolve(databaseRoot, 'dist/runtime-scripts');
  const prismaBin = resolve(
    workspaceRoot,
    `node_modules/.bin/prisma${process.platform === 'win32' ? '.cmd' : ''}`,
  );
  const migrationsDir = resolve(databaseRoot, 'prisma/migrations');
  const commands: Command[] = [
    {
      executable: process.execPath,
      args: [resolve(runtimeScripts, 'prepare-ai-knowledge-index-pgvector.js')],
      cwd: databaseRoot,
      label: 'prepare pgvector',
    },
    {
      executable: process.execPath,
      args: [resolve(runtimeScripts, 'prepare-ai-vnext-runtime-state-retirement.js')],
      cwd: databaseRoot,
      label: 'retire legacy AI runtime state',
    },
  ];

  if (hasPrismaMigrations(migrationsDir)) {
    commands.push({
      executable: prismaBin,
      args: ['migrate', 'deploy', '--config', './prisma/prisma.config.ts'],
      cwd: databaseRoot,
      label: 'deploy Prisma migrations',
    });
  } else {
    commands.push(
      {
        executable: process.execPath,
        args: [resolve(runtimeScripts, 'prepare-goal-record-source-correlation.js')],
        cwd: databaseRoot,
        label: 'prepare goal-record source correlation',
      },
      {
        executable: process.execPath,
        args: [resolve(runtimeScripts, 'prepare-editor-workspace-natural-key.js')],
        cwd: databaseRoot,
        label: 'prepare editor-workspace natural key',
      },
      {
        executable: process.execPath,
        args: [resolve(runtimeScripts, 'prepare-notification-preference-hierarchy.js')],
        cwd: databaseRoot,
        label: 'prepare notification preference hierarchy',
      },
      {
        executable: process.execPath,
        args: [resolve(runtimeScripts, 'prepare-vnext-unique-constraints.js')],
        cwd: databaseRoot,
        label: 'prepare vNext unique constraints',
      },
      {
        executable: prismaBin,
        args: [
          'db',
          'push',
          '--config',
          './prisma/prisma.config.ts',
          ...(process.env.MIGRATOR_ACCEPT_DATA_LOSS === '1' ? ['--accept-data-loss'] : []),
        ],
        cwd: databaseRoot,
        label: 'reconcile Prisma schema',
      },
    );
  }

  commands.push(
    {
      executable: process.execPath,
      args: [resolve(runtimeScripts, 'prepare-ai-provider-onboarding-sessions.js')],
      cwd: databaseRoot,
      label: 'prepare AI provider onboarding sessions',
    },
    {
      executable: process.execPath,
      args: [resolve(runtimeScripts, 'prepare-ai-provider-default-invariant.js')],
      cwd: databaseRoot,
      label: 'prepare AI provider default invariant',
    },
    {
      executable: process.execPath,
      args: [resolve(runtimeScripts, 'ensure-task-goal-binding-constraint.js')],
      cwd: databaseRoot,
      label: 'ensure Task goal-binding constraint',
    },
    {
      executable: process.execPath,
      args: [resolve(runtimeScripts, 'bootstrap-ai-knowledge-index.js')],
      cwd: databaseRoot,
      label: 'bootstrap AI knowledge index',
    },
    {
      executable: process.execPath,
      args: [resolve(runtimeScripts, 'verify-ai-knowledge-index.js'), '--require-pgvector'],
      cwd: databaseRoot,
      label: 'verify AI knowledge index',
    },
  );

  return commands;
}

export function runMigrator(workspaceRoot = resolve(process.cwd(), '../..')): void {
  process.env.DATABASE_URL = resolveDatabaseUrl(process.env);
  for (const command of createMigrationCommands(workspaceRoot)) {
    run(command);
  }
  console.log('[migrator] Database initialization completed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runMigrator();
}
