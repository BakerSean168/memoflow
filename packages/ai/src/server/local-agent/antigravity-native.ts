import { realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import {
  AntigravityAuthorizationUrlSchema,
  type LocalAgentConnection,
} from '@memoflow/contracts/ai';
import { LocalAgentError } from '../../shared/local-agent-error';
import { resolveNativeExecutable } from './native-executable';

export const ANTIGRAVITY_AUTH_PROMPT_PREFIX =
  'Open the following link to authenticate the ACP server: ';
/** The BROWSER helper reports the URL on stderr instead of launching an OS browser. */
export const ANTIGRAVITY_AUTH_URL_MARKER = '__MEMOFLOW_AGY_AUTH_URL__';
const MAX_AUTHORIZATION_URL_LENGTH = 16_384;

export interface AntigravityAuthorizationUrl {
  authorizationUrl: string;
  redirectUri: string;
  state: string;
}

/** This is the official ACP profile, not the separate agy CLI account store. */
export function antigravityHome(home?: string): string {
  return home ?? process.env.GEMINI_HOME ?? join(homedir(), '.gemini');
}

/** Existence-only login preflight; identity hashing never exports credentials. */
export function antigravityHasCachedAuth(home?: string): boolean {
  try {
    return statSync(join(antigravityHome(home), 'antigravity-acp', 'acp_token.json')).isFile();
  } catch {
    return false;
  }
}

/** Resolve the official binary and its sibling harness without installing anything. */
export function antigravityExecutable(input: string): string {
  if (process.platform === 'win32') return resolveNativeExecutable(input, 'antigravity').sdkPath;
  const names = input.endsWith('.par') ? [input] : [input, `${input}.par`];
  const candidates =
    isAbsolute(input) || input.includes('/')
      ? names
      : (process.env.PATH ?? '')
          .split(delimiter)
          .filter(Boolean)
          .flatMap((directory) => names.map((name) => join(directory, name)));
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return realpathSync(candidate);
    } catch {
      // Try the next explicitly configured/PATH-resolved candidate.
    }
  }
  throw new LocalAgentError('LOCAL_AGENT_NOT_INSTALLED');
}

/** Never let a catalog probe switch to inherited API credentials or open a login browser. */
export function antigravityEnvironment(
  connection: LocalAgentConnection,
  executable: string,
  temporaryDirectory: string,
  options: { captureBrowserUrl?: boolean } = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const forbidden =
    /^(?:GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_CLOUD_PROJECT|GOOGLE_CLOUD_LOCATION|GOOGLE_CLOUD_QUOTA_PROJECT|AGY_ACP_CCPA_PROJECT|AGY_ACP_ENABLE_OAUTH|ANTIGRAVITY_HARNESS_PATH|GEMINI_HOME|BROWSER)$/i;
  for (const [key, value] of Object.entries(process.env)) {
    if (!forbidden.test(key)) env[key] = value;
  }
  // The native Python browser hook must succeed without opening an external URL.
  // This fixed command contains no user input; auth output is rejected by the transport.
  // The explicit login flow swaps the no-op body for one that reports the URL on
  // stderr, so the native process still cannot launch a browser of its own.
  const nodePath = process.execPath.replace(/\\/g, '/');
  if (/[\r\n\0"%]/u.test(nodePath) || nodePath.includes(process.platform === 'win32' ? ';' : ':'))
    throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
  env.BROWSER = options.captureBrowserUrl
    ? `"${nodePath}" -e "process.stderr.on('error',()=>process.exit(0)).write('${ANTIGRAVITY_AUTH_URL_MARKER}'+JSON.stringify(process.argv[1])+'\\n',()=>process.exit(0))" -- %s`
    : `"${nodePath}" -e "process.exit(0)" -- %s`;
  env.ELECTRON_RUN_AS_NODE = '1';
  env.GEMINI_HOME = antigravityHome(connection.homePath);
  env.AGY_ACP_FORCE_FILE_STORAGE = '1';
  const harness = join(
    dirname(executable),
    process.platform === 'win32' ? 'localharness_external.exe' : 'localharness_external',
  );
  try {
    if (statSync(harness).isFile()) env.ANTIGRAVITY_HARNESS_PATH = harness;
  } catch {
    // Some official distributions locate their own bundled harness.
  }
  if (process.platform === 'win32') {
    env.TEMP = temporaryDirectory;
    env.TMP = temporaryDirectory;
  } else env.TMPDIR = temporaryDirectory;
  return env;
}

/**
 * Accept only the official Google authorization URL. The URL is returned to the
 * renderer for an explicit open/copy action; it is never logged or persisted.
 */
export function parseAntigravityAuthorizationUrl(raw: string): AntigravityAuthorizationUrl | null {
  const parsed = AntigravityAuthorizationUrlSchema.safeParse(raw);
  if (!parsed.success) return null;
  const url = new URL(parsed.data);
  return {
    authorizationUrl: parsed.data,
    redirectUri: url.searchParams.get('redirect_uri')!,
    state: url.searchParams.get('state')!,
  };
}

/**
 * A pasted redirect URL must belong to the pending flow before it may be relayed
 * to the native loopback listener. Origin, path, state and response shape are all
 * checked; nothing is inferred from a successful HTTP response.
 */
export function parseAntigravityCallbackUrl(
  pending: Pick<AntigravityAuthorizationUrl, 'redirectUri' | 'state'>,
  raw: string,
): URL | null {
  if (raw.length > MAX_AUTHORIZATION_URL_LENGTH) return null;
  let callback: URL;
  let expected: URL;
  try {
    callback = new URL(raw);
    expected = new URL(pending.redirectUri);
  } catch {
    return null;
  }
  if (
    callback.protocol !== 'http:' ||
    callback.hostname !== '127.0.0.1' ||
    callback.origin !== expected.origin ||
    callback.pathname !== expected.pathname ||
    callback.username !== '' ||
    callback.password !== '' ||
    callback.hash !== ''
  )
    return null;
  const states = callback.searchParams.getAll('state');
  if (states.length !== 1 || states[0] !== pending.state) return null;
  const codes = callback.searchParams.getAll('code');
  const errors = callback.searchParams.getAll('error');
  const validResponse =
    (codes.length === 1 && Boolean(codes[0]) && errors.length === 0) ||
    (errors.length === 1 && Boolean(errors[0]) && codes.length === 0);
  if (!validResponse) return null;
  const issuers = callback.searchParams.getAll('iss');
  if (issuers.length > 1 || (issuers.length === 1 && issuers[0] !== 'https://accounts.google.com'))
    return null;
  return callback;
}
