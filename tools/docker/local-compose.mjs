import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getRuntimeProfile, resolveLocalDockerHostPorts } from '../runtime/load-profiles.mjs';
import { detectHostEnvShadowing } from './env-shadow.mjs';

export { detectHostEnvShadowing } from './env-shadow.mjs';

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const baseEnvFile = '.env.production';
const envFile = '.env.production.local';
const machineEnvFile = '.env.local';

/**
 * Build Compose argv using the repository production defaults plus the optional
 * gitignored local secret overlay. Docker Compose applies later --env-file
 * entries with higher precedence, matching MemoFlow's documented env layering.
 *
 * @param {{ cwd?: string }} [options]
 * @returns {string[]}
 */
export function createLocalComposeArgs(options = {}) {
  const cwd = options.cwd ?? workspaceRoot;
  const args = ['compose', '-f', 'docker-compose.local.yml', '--env-file', baseEnvFile];
  if (existsSync(resolve(cwd, envFile))) {
    args.push('--env-file', envFile);
  }
  return args;
}

/** Compose argv shared by CLI and validate-local-deploy evidence collection. */
export const localComposeArgs = createLocalComposeArgs();
const composeArgs = localComposeArgs;

function readEnvFileMap(path) {
  if (!existsSync(path)) {
    return new Map();
  }

  const values = new Map();
  const lines = readFileSync(path, 'utf8').split(/\r?\n/u);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/\s+#.*$/u, '').trim();

    values.set(key, value);
  }

  return values;
}

function readEnvFileKeys(path) {
  return new Set(readEnvFileMap(path).keys());
}

function run(bin, args, env) {
  const shouldUseCmdShim = process.platform === 'win32' && /\.(cmd|bat)$/iu.test(bin);
  const spawnCommand = shouldUseCmdShim ? 'cmd.exe' : bin;
  const spawnArgs = shouldUseCmdShim ? ['/d', '/s', '/c', bin, ...args] : args;

  const result = spawnSync(spawnCommand, spawnArgs, {
    stdio: 'inherit',
    env,
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

function runGitCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    exitCode: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Resolve the exact source identity used by local Docker builds. A dirty tree
 * includes a content fingerprint so two different worktrees at the same HEAD
 * cannot share stale image/browser evidence. Generated reports and browser
 * artifacts are excluded to mirror the Docker build context in `.dockerignore`.
 *
 * @param {{ cwd?: string, runCommand?: Function, readFile?: Function }} [options]
 * @returns {string}
 */
export function resolveWorkspaceRevision(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const runCommand = options.runCommand ?? runGitCommand;
  const readFile = options.readFile ?? readFileSync;
  const runGit = (args) => runCommand('git', args, { cwd });

  const revisionResult = runGit(['rev-parse', 'HEAD']);
  if (revisionResult.exitCode !== 0) {
    return 'unknown';
  }

  const revision = revisionResult.stdout.trim();
  const sourcePathspec = [
    '--',
    '.',
    ':(exclude)docs/**',
    ':(exclude)reports/**',
    ':(exclude).github/**',
    ':(exclude,glob)apps/web/playwright*-report/**',
    ':(exclude,glob)apps/web/test-results*/**',
  ];
  const diffResult = runGit(['diff', '--binary', 'HEAD', ...sourcePathspec]);
  const untrackedResult = runGit([
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    ...sourcePathspec,
  ]);

  if (diffResult.exitCode !== 0 || untrackedResult.exitCode !== 0) {
    throw new Error('Unable to fingerprint the local Docker worktree revision.');
  }

  const trackedDiff = diffResult.stdout;
  const untrackedFiles = untrackedResult.stdout
    .split('\0')
    .map((file) => file.trim())
    .filter(Boolean)
    .sort();

  if (!trackedDiff && untrackedFiles.length === 0) {
    return revision;
  }

  const hash = createHash('sha256');
  hash.update('tracked\0');
  hash.update(trackedDiff);
  for (const file of untrackedFiles) {
    hash.update('\0untracked\0');
    hash.update(file);
    hash.update('\0');
    hash.update(readFile(resolve(cwd, file)));
  }

  return `${revision}-dirty-${hash.digest('hex').slice(0, 12)}`;
}

export function mergeLocalDockerWebOrigins(webHostPort, ...configuredValues) {
  const values = [
    ...configuredValues,
    `http://localhost:${webHostPort}`,
    `http://127.0.0.1:${webHostPort}`,
  ];

  return [
    ...new Set(
      values
        .flatMap((value) => String(value ?? '').split(','))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ].join(',');
}

export function createLocalDockerAuthBaseUrl(apiHostPort) {
  return `http://localhost:${apiHostPort}/api/auth`;
}

export function createLocalDockerWebUrl(webHostPort) {
  return `http://localhost:${webHostPort}`;
}

export function extractHttpOrigin(value) {
  const candidate = String(value ?? '').trim();
  if (!candidate) return '';

  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : '';
  } catch {
    return '';
  }
}

export function resolveLocalDockerPowerSyncUrl(powersyncHostPort, publicUrl) {
  const configured = String(publicUrl ?? '').trim();
  return configured || `http://localhost:${powersyncHostPort}`;
}

export function resolveLocalDockerBrowserValidationOrigins({
  apiHostPort,
  webHostPort,
  authBaseUrl,
  webUrl,
}) {
  return {
    apiOrigin: extractHttpOrigin(authBaseUrl) || `http://127.0.0.1:${apiHostPort}`,
    webOrigin: extractHttpOrigin(webUrl) || `http://127.0.0.1:${webHostPort}`,
  };
}

/**
 * Force local-docker host ports from SSOT so local stack never steals host-dev/e2e ports.
 * Secrets and service env still come from .env.production.local.
 */
function applyLocalDockerHostPortIsolation(
  env,
  envFileMap,
  machineEnvFileMap,
  { quiet = false } = {},
) {
  /** @type {Record<string, string>} */
  const fromFile = {};
  const profile = getRuntimeProfile('local-docker');
  const allowMachineOverride =
    machineEnvFileMap.get('LOCAL_DOCKER_MACHINE_PORTS')?.toLowerCase() === 'true';

  for (const key of Object.keys(profile.hostPortEnv ?? {})) {
    if (allowMachineOverride && machineEnvFileMap.has(key)) {
      fromFile[key] = machineEnvFileMap.get(key) ?? '';
    } else if (envFileMap.has(key)) {
      fromFile[key] = envFileMap.get(key) ?? '';
    } else if (env[key]) {
      fromFile[key] = String(env[key]);
    }
  }

  const resolved = resolveLocalDockerHostPorts(fromFile, { allowMachineOverride });
  for (const warning of resolved.warnings) {
    if (!quiet) {
      console.warn(`[docker:local] ${warning}`);
    }
  }
  for (const error of resolved.errors) {
    console.error(`[docker:local] ${error}`);
  }
  if (!resolved.ok) {
    process.exit(1);
  }

  for (const [key, value] of Object.entries(resolved.forced)) {
    env[key] = value;
  }

  // Keep public PowerSync URL aligned with isolated host port when unset or still pointing at classic ports.
  const powersyncHostPort = resolved.forced.POWERSYNC_HOST_PORT ?? '20202';
  const machinePowerSyncUrl = allowMachineOverride
    ? (machineEnvFileMap.get('POWERSYNC_URL')?.trim() ?? '')
    : '';
  const currentPowerSyncUrl =
    machinePowerSyncUrl || env.POWERSYNC_URL || envFileMap.get('POWERSYNC_URL') || '';
  const isolatedPowerSyncUrl = resolveLocalDockerPowerSyncUrl(powersyncHostPort);
  if (machinePowerSyncUrl) {
    env.POWERSYNC_URL = resolveLocalDockerPowerSyncUrl(powersyncHostPort, machinePowerSyncUrl);
  } else if (
    allowMachineOverride ||
    !currentPowerSyncUrl ||
    /localhost:8080\b/u.test(currentPowerSyncUrl) ||
    /localhost:8081\b/u.test(currentPowerSyncUrl)
  ) {
    env.POWERSYNC_URL = isolatedPowerSyncUrl;
    if (currentPowerSyncUrl && currentPowerSyncUrl !== isolatedPowerSyncUrl && !quiet) {
      console.warn(
        `[docker:local] POWERSYNC_URL=${currentPowerSyncUrl} looks like host-dev; using ${isolatedPowerSyncUrl}`,
      );
    }
  }

  if (!quiet) {
    console.log(
      `[docker:local] host ports: API=${env.API_HOST_PORT} WEB=${env.WEB_HOST_PORT} PS=${env.POWERSYNC_HOST_PORT} PG=${env.POSTGRES_HOST_PORT} REDIS=${env.REDIS_HOST_PORT}`,
    );
  }
}

/**
 * Build process env for local-docker compose (secrets + PowerSync fallbacks + port isolation).
 * Exported so validate-local-deploy can run `compose ps/logs` with the same interpolation
 * as `pnpm docker:local:*` (bare `--env-file .env.production.local` lacks POWERSYNC_* keys).
 *
 * @param {{ quiet?: boolean, cwd?: string }} [options]
 * @returns {NodeJS.ProcessEnv}
 */
export function createLocalComposeRuntimeEnv(options = {}) {
  const quiet = options.quiet === true;
  const log = quiet ? () => {} : console.log.bind(console);
  const warn = quiet ? () => {} : console.warn.bind(console);
  const cwd = options.cwd ?? workspaceRoot;

  const env = {
    ...process.env,
    NX_DAEMON: 'false',
    NX_ISOLATE_PLUGINS: 'false',
  };
  env.VCS_REF ||= resolveWorkspaceRevision({ cwd });
  env.BUILD_DATE ||= new Date().toISOString();

  log(`[docker:local] image revision: ${env.VCS_REF}`);
  log(`[docker:local] image build date: ${env.BUILD_DATE}`);

  const envFileMap = readEnvFileMap(resolve(cwd, envFile));
  const envKeys = new Set(envFileMap.keys());
  const machineEnvFileMap = readEnvFileMap(resolve(cwd, machineEnvFile));
  const developmentEnv = readEnvFileMap(resolve(cwd, '.env.development'));
  const shareDevelopmentSecrets =
    machineEnvFileMap.get('LOCAL_DOCKER_SHARE_DEV_SECRETS')?.toLowerCase() === 'true';

  if (shareDevelopmentSecrets) {
    for (const key of ['JWT_SECRET', 'REFRESH_TOKEN_SECRET']) {
      const value = developmentEnv.get(key);
      if (value) {
        env[key] = value;
      }
    }
  }

  for (const warning of detectHostEnvShadowing(process.env, envFileMap)) {
    warn(warning);
  }

  // Local-only secret defaults so prod-like compose can start without copying
  // production secrets into the working tree. Never treat these as real secrets.
  const localSecretFallbacks = {
    REDIS_PASSWORD: 'local-redis-password',
    JWT_SECRET: 'local-jwt-secret-change-me-for-prod-like-only',
    DB_PASSWORD: 'local-db-password',
  };

  for (const [key, fallback] of Object.entries(localSecretFallbacks)) {
    if (!env[key] && !envKeys.has(key)) {
      env[key] = fallback;
      log(
        `[docker:local] ${key} is not set in .env.production.local, using a local default for Docker validation.`,
      );
    }
  }

  const powerSyncFallbacks = {
    POWERSYNC_URL: 'http://localhost:20202',
    POWERSYNC_KEY_ID: developmentEnv.get('POWERSYNC_KEY_ID') ?? 'powersync-dev-d90f228f',
    POWERSYNC_PRIVATE_KEY: developmentEnv.get('POWERSYNC_PRIVATE_KEY') ?? '',
    POWERSYNC_PUBLIC_KEY_N: developmentEnv.get('POWERSYNC_PUBLIC_KEY_N') ?? '',
    POWERSYNC_PUBLIC_KEY_E: developmentEnv.get('POWERSYNC_PUBLIC_KEY_E') ?? 'AQAB',
  };

  for (const [key, fallback] of Object.entries(powerSyncFallbacks)) {
    if (!env[key] && !envKeys.has(key) && fallback) {
      env[key] = fallback;
      log(`[docker:local] ${key} is not set in .env.production.local, using a local default.`);
    }
  }

  applyLocalDockerHostPortIsolation(env, envFileMap, machineEnvFileMap, { quiet });

  // Better Auth embeds this public origin in verification and reset links.
  // Keep both API callbacks and browser confirmation pages aligned with the
  // resolved host ports used by Compose. When the machine opted into port
  // overrides and explicitly set AUTH_BASE_URL / MEMOFLOW_WEB_URL (e.g. an
  // external Tailscale magic-DNS origin for OAuth callbacks), preserve those
  // values instead of forcing localhost, so browser redirects stay reachable.
  const machineUrlOverride =
    machineEnvFileMap.get('LOCAL_DOCKER_MACHINE_PORTS')?.toLowerCase() === 'true';
  if (machineUrlOverride && machineEnvFileMap.has('AUTH_BASE_URL')) {
    env.AUTH_BASE_URL = machineEnvFileMap.get('AUTH_BASE_URL') ?? env.AUTH_BASE_URL;
  } else {
    env.AUTH_BASE_URL = createLocalDockerAuthBaseUrl(env.API_HOST_PORT);
  }
  if (machineUrlOverride && machineEnvFileMap.has('MEMOFLOW_WEB_URL')) {
    env.MEMOFLOW_WEB_URL = machineEnvFileMap.get('MEMOFLOW_WEB_URL') ?? env.MEMOFLOW_WEB_URL;
  } else {
    env.MEMOFLOW_WEB_URL = createLocalDockerWebUrl(env.WEB_HOST_PORT);
  }

  // Compose defaults use the shared local-docker ports. When a machine opts
  // into isolated overrides, keep browser-facing CORS allowlists aligned with
  // the resolved Web origin or an otherwise healthy stack rejects every API
  // request from the page.
  const publicWebOrigin = extractHttpOrigin(env.MEMOFLOW_WEB_URL);
  env.LOCAL_DOCKER_CORS_ORIGIN = mergeLocalDockerWebOrigins(
    env.WEB_HOST_PORT,
    publicWebOrigin,
    env.LOCAL_DOCKER_CORS_ORIGIN,
    envFileMap.get('LOCAL_DOCKER_CORS_ORIGIN'),
  );

  return env;
}

function createRuntimeEnv() {
  return createLocalComposeRuntimeEnv();
}

function resolvePnpmInvocation() {
  // Prefer Corepack when available so packageManager-pinned repos stay on the
  // declared pnpm major/minor even if the host bare `pnpm` shim is broken.
  if (process.platform !== 'win32') {
    const probe = spawnSync('corepack', ['pnpm', '--version'], {
      encoding: 'utf8',
    });
    if (typeof probe.status === 'number' && probe.status === 0) {
      return { bin: 'corepack', prefixArgs: ['pnpm'] };
    }
  }

  return {
    bin: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    prefixArgs: [],
  };
}

function runBuildPrep(env, { skipNxCache = false } = {}) {
  const { bin, prefixArgs } = resolvePnpmInvocation();
  const nxCacheArgs = skipNxCache ? ['--skipNxCache'] : [];

  run(bin, [...prefixArgs, 'nx', 'build', 'api', ...nxCacheArgs], env);
  run(
    bin,
    [...prefixArgs, 'nx', 'build', 'web', '--configuration=production', ...nxCacheArgs],
    env,
  );
}

function runDockerCompose(extraArgs, env) {
  run('docker', [...composeArgs, ...extraArgs], env);
}

function isExecutedAsCli() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return existsSync(entry) && import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return /local-compose\.mjs$/u.test(entry.replace(/\\/gu, '/'));
  }
}

if (isExecutedAsCli()) {
  const command = process.argv[2] ?? 'up';
  const env = createRuntimeEnv();

  switch (command) {
    case 'build-prep':
      runBuildPrep(env);
      break;
    case 'build-prep:rebuild':
      runBuildPrep(env, { skipNxCache: true });
      break;
    case 'up':
      runBuildPrep(env);
      runDockerCompose(['up', '--build', '-d'], env);
      break;
    case 'rebuild':
      runBuildPrep(env, { skipNxCache: true });
      runDockerCompose(['build', '--no-cache'], env);
      runDockerCompose(['up', '-d'], env);
      break;
    case 'down':
      runDockerCompose(['down'], env);
      break;
    case 'logs':
      runDockerCompose(['logs', '-f'], env);
      break;
    case 'ps':
      runDockerCompose(['ps'], env);
      break;
    default:
      console.error(`Unsupported command: ${command}`);
      process.exit(1);
  }
}
