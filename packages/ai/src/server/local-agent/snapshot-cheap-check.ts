import { open } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import type { LocalAgentConnection } from '@memoflow/ai-contracts';
import { antigravityExecutable, antigravityHasCachedAuth } from './antigravity-native';
import { LocalAgentError } from '../../shared/local-agent-error';
import { resolveNativeExecutable } from './native-executable';
import { nativeHome, nativeIdentity } from './native-identity';

/** A model catalog older than this must be refreshed by a complete native probe. */
export const FULL_PROBE_TTL_MS = 24 * 60 * 60_000;

/**
 * Zero-process availability opinion for one native connection. A cheap verdict can
 * only lower a snapshot (not installed / login required) or ask for a full probe.
 * It can never produce `ready`: only a complete driver probe observes models.
 */
export type CheapVerdict =
  | { kind: 'not_installed'; message: string }
  | { kind: 'login_required'; message: string }
  | { kind: 'unchanged' }
  | { kind: 'changed'; reason: 'identity' | 'executable' | 'stale' }
  | { kind: 'unknown' };

/** The persisted facts a cheap check may compare; deliberately not the status itself. */
export interface CheapSnapshotFacts {
  identity: string;
  executableSignature?: string;
  checkedAt: number;
}

export interface CheapCheckEnvironment {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  now?: number;
  isFile?: (path: string) => boolean;
  stat?: (path: string) => { size: number; mtimeMs: number; ino?: number };
  /** Bounded credential/config read; `null` means the file does not exist. */
  readText?: (path: string) => Promise<string | null>;
  identity?: (driver: LocalAgentConnection['driver'], home?: string) => Promise<string>;
  hasCachedAuth?: (home?: string) => boolean;
  antigravityExecutable?: (input: string) => string;
}

const MISSING_EXECUTABLE_MESSAGE = 'The configured Agent executable could not be started.';
const MISSING_LOGIN_MESSAGE = 'Sign in using the Agent’s native login command, then refresh.';

function defaultIsFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Bounded credential read: never load more than 1 MiB, never follow a directory. */
async function boundedRead(path: string): Promise<string | null> {
  try {
    const file = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(1_048_577);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const result = await file.read(buffer, bytesRead, buffer.length - bytesRead);
        if (result.bytesRead === 0) break;
        bytesRead += result.bytesRead;
      }
      if (bytesRead > 1_048_576) return null;
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await file.close();
    }
  } catch {
    return null;
  }
}

/**
 * Resolve the file a native driver would actually launch. Bare default commands
 * (`codex`, `claude`, …) must be looked up on PATH here; Windows shims are handled
 * by the existing resolver so `.cmd` launchers are not misread as missing.
 */
export function resolveEffectiveExecutable(
  connection: LocalAgentConnection,
  environment: CheapCheckEnvironment = {},
): string {
  const platform = environment.platform ?? process.platform;
  if (connection.driver === 'antigravity')
    return (environment.antigravityExecutable ?? antigravityExecutable)(connection.executablePath);
  if (platform === 'win32')
    return resolveNativeExecutable(connection.executablePath, connection.driver, {
      platform,
      env: environment.env ?? process.env,
      isFile: environment.isFile,
    }).sdkPath;
  const isFile = environment.isFile ?? defaultIsFile;
  const input = connection.executablePath;
  if (isAbsolute(input) || input.includes('/')) {
    if (isFile(input)) return input;
    throw new LocalAgentError('LOCAL_AGENT_NOT_INSTALLED');
  }
  const searchPath = (environment.env ?? process.env).PATH ?? '';
  for (const directory of searchPath.split(delimiter).filter(Boolean)) {
    const candidate = join(directory.replace(/^"|"$/gu, ''), input);
    if (isFile(candidate)) return candidate;
  }
  throw new LocalAgentError('LOCAL_AGENT_NOT_INSTALLED');
}

export function nativeExecutableExists(
  connection: LocalAgentConnection,
  environment: CheapCheckEnvironment = {},
): boolean {
  try {
    resolveEffectiveExecutable(connection, environment);
    return true;
  } catch {
    return false;
  }
}

/** `size:mtime` (plus inode when the platform reports one) of the resolved binary. */
export function nativeExecutableSignature(
  connection: LocalAgentConnection,
  environment: CheapCheckEnvironment = {},
): string | null {
  try {
    const resolved = resolveEffectiveExecutable(connection, environment);
    const info = (environment.stat ?? statSync)(resolved);
    return `${info.size}:${info.mtimeMs}${info.ino !== undefined ? `:${info.ino}` : ''}`;
  } catch {
    return null;
  }
}

type CredentialPresence = 'present' | 'missing' | 'unknown';

function parseJsonRecord(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function hasApiKey(value: unknown, depth = 0): boolean {
  if (depth > 8 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => hasApiKey(item, depth + 1));
  return Object.entries(value).some(
    ([key, entry]) =>
      (key === 'apiKey' && typeof entry === 'string' && entry.length > 0) ||
      hasApiKey(entry, depth + 1),
  );
}

/**
 * Per-driver credential preflight. `missing` is only returned for a strong signal:
 * an absent credential file and no configuration that could supply one elsewhere.
 * Anything ambiguous becomes `unknown` and falls through to a complete probe.
 */
async function credentialPresence(
  connection: LocalAgentConnection,
  environment: CheapCheckEnvironment,
): Promise<CredentialPresence> {
  const readText = environment.readText ?? boundedRead;
  const env = environment.env ?? process.env;
  const home = nativeHome(connection.driver, connection.homePath);
  if (connection.driver === 'codex') {
    if (env.OPENAI_API_KEY?.trim()) return 'present';
    if ((await readText(join(home, 'auth.json'))) !== null) return 'present';
    const config = await readText(join(home, 'config.toml'));
    if (config && /(^|\n)\s*(?:model_provider\s*=|\[model_providers\.)/u.test(config))
      return 'unknown';
    return 'missing';
  }
  if (connection.driver === 'claude') {
    if (env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim()) return 'present';
    if ((await readText(join(home, '.credentials.json'))) !== null) return 'present';
    const settingsText = await readText(join(home, 'settings.json'));
    if (settingsText === null) return 'missing';
    const settings = parseJsonRecord(settingsText);
    if (!settings) return 'unknown';
    if (typeof settings.apiKeyHelper === 'string') return 'unknown';
    const declared = settings.env;
    if (
      declared &&
      typeof declared === 'object' &&
      !Array.isArray(declared) &&
      ('ANTHROPIC_API_KEY' in declared || 'ANTHROPIC_AUTH_TOKEN' in declared)
    )
      return 'unknown';
    return 'missing';
  }
  if (connection.driver === 'pi') {
    if ((await readText(join(home, 'auth.json'))) !== null) return 'present';
    const modelsText = await readText(join(home, 'models.json'));
    if (modelsText === null) return 'missing';
    const models = parseJsonRecord(modelsText);
    if (!models) return 'unknown';
    return hasApiKey(models) ? 'present' : 'missing';
  }
  if (connection.driver === 'antigravity')
    return (environment.hasCachedAuth ?? antigravityHasCachedAuth)(connection.homePath)
      ? 'present'
      : 'missing';
  // dsh has no native login handshake, so it has no trustworthy cheap login signal.
  return 'unknown';
}

/**
 * Cheap availability check. Reads files and stats the executable only; it never
 * spawns a process. `unchanged` additionally requires the last complete probe to
 * be younger than `FULL_PROBE_TTL_MS`, so a directory can never stay stale forever.
 */
export async function cheapVerdict(
  connection: LocalAgentConnection,
  previous: CheapSnapshotFacts | null,
  environment: CheapCheckEnvironment = {},
): Promise<CheapVerdict> {
  try {
    resolveEffectiveExecutable(connection, environment);
  } catch {
    return { kind: 'not_installed', message: MISSING_EXECUTABLE_MESSAGE };
  }
  const signature = nativeExecutableSignature(connection, environment);
  if (!signature) return { kind: 'unknown' };

  const credentials = await credentialPresence(connection, environment);
  if (credentials === 'missing') return { kind: 'login_required', message: MISSING_LOGIN_MESSAGE };

  let identity: string;
  try {
    identity = await (environment.identity ?? nativeIdentity)(
      connection.driver,
      connection.homePath ?? undefined,
    );
  } catch (error) {
    if (error instanceof LocalAgentError && error.code === 'LOCAL_AGENT_LOGIN_REQUIRED')
      return { kind: 'login_required', message: MISSING_LOGIN_MESSAGE };
    return { kind: 'unknown' };
  }

  if (!previous) return { kind: 'unknown' };
  if (previous.identity !== identity) return { kind: 'changed', reason: 'identity' };
  if (previous.executableSignature && previous.executableSignature !== signature)
    return { kind: 'changed', reason: 'executable' };
  const now = environment.now ?? Date.now();
  if (now - previous.checkedAt >= FULL_PROBE_TTL_MS) return { kind: 'changed', reason: 'stale' };
  return { kind: 'unchanged' };
}
