import path from 'node:path';
import { loadWorkspaceEnv } from './_shared/load-workspace-env.js';
import { publishProfileSnapshot } from '../src/modules/powersync/snapshot-storage.js';

interface CliOptions {
  identityId: string | null;
  sqlitePath: string | null;
  version: string;
  generatedAt: string | null;
  snapshotRootDir: string | null;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let identityId: string | null = null;
  let sqlitePath: string | null = null;
  let version = new Date().toISOString();
  let generatedAt: string | null = null;
  let snapshotRootDir: string | null = null;
  let json = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--identity-id':
        identityId = next ?? null;
        index += 1;
        break;
      case '--sqlite-path':
        sqlitePath = next ?? null;
        index += 1;
        break;
      case '--version':
        version = next ?? version;
        index += 1;
        break;
      case '--generated-at':
        generatedAt = next ?? null;
        index += 1;
        break;
      case '--snapshot-root-dir':
        snapshotRootDir = next ?? null;
        index += 1;
        break;
      case '--json':
        json = true;
        break;
      case '--help':
      case '-h':
        help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    identityId,
    sqlitePath,
    version,
    generatedAt,
    snapshotRootDir,
    json,
    help,
  };
}

function printUsage(): void {
  console.log(`Usage: tsx apps/api/scripts/publish-powersync-profile-snapshot.ts --identity-id <identityId> --sqlite-path <path> [options]

Options:
  --identity-id <value>         Required. Identity ID that owns this snapshot.
  --sqlite-path <path>          Required. Path to a prepared powersync.sqlite file.
  --version <value>             Optional. Snapshot version. Defaults to current ISO timestamp.
  --generated-at <value>        Optional. Override manifest generatedAt timestamp.
  --snapshot-root-dir <path>    Optional. Overrides POWERSYNC_SNAPSHOT_DIR.
  --json                        Print the publish result as JSON.
  --help, -h                    Show this help message.
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  loadWorkspaceEnv();
  const { env } = await import('../src/shared/infrastructure/config/env.js');

  if (!options.identityId) {
    throw new Error('--identity-id is required.');
  }

  if (!options.sqlitePath) {
    throw new Error('--sqlite-path is required.');
  }

  const snapshotRootDir = options.snapshotRootDir ?? env.POWERSYNC_SNAPSHOT_DIR;
  if (!snapshotRootDir) {
    throw new Error(
      'POWERSYNC_SNAPSHOT_DIR is not configured. Pass --snapshot-root-dir or set the env var.',
    );
  }

  const result = await publishProfileSnapshot({
    snapshotRootDir,
    identityId: options.identityId,
    sqlitePath: path.resolve(options.sqlitePath),
    version: options.version,
    generatedAt: options.generatedAt ?? undefined,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Snapshot published for ${options.identityId}`);
  console.log(`- snapshotKey: ${result.snapshotKey}`);
  console.log(`- databasePath: ${result.databasePath}`);
  console.log(`- manifestPath: ${result.manifestPath}`);
  console.log(`- version: ${result.manifest.version}`);
  console.log(`- checksumSha256: ${result.manifest.checksumSha256}`);
  console.log(`- fileSize: ${result.fileSize}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
