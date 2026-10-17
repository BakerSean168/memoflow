import { realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import type { LocalAgentConnection } from '@memoflow/contracts/ai';
import { LocalAgentError } from '../../shared/local-agent-error';
import { resolveNativeExecutable } from './native-executable';

export const ANTIGRAVITY_AUTH_PROMPT_PREFIX =
  'Open the following link to authenticate the ACP server: ';

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
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const forbidden =
    /^(?:GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_GENAI_USE_VERTEXAI|GOOGLE_CLOUD_PROJECT|GOOGLE_CLOUD_LOCATION|GOOGLE_CLOUD_QUOTA_PROJECT|AGY_ACP_CCPA_PROJECT|AGY_ACP_ENABLE_OAUTH|ANTIGRAVITY_HARNESS_PATH|GEMINI_HOME|BROWSER)$/i;
  for (const [key, value] of Object.entries(process.env)) {
    if (!forbidden.test(key)) env[key] = value;
  }
  // The native Python browser hook must succeed without opening an external URL.
  // This fixed command contains no user input; auth output is rejected by the transport.
  const nodePath = process.execPath.replace(/\\/g, '/');
  if (/[\r\n\0"%]/u.test(nodePath) || nodePath.includes(process.platform === 'win32' ? ';' : ':'))
    throw new LocalAgentError('LOCAL_AGENT_UNAVAILABLE');
  env.BROWSER = `"${nodePath}" -e "process.exit(0)" -- %s`;
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
