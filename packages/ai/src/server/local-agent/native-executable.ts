import { statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { win32 } from 'node:path';
import type { LocalAgentConnection, LocalAgentDriver } from '@memoflow/ai-contracts';
import { LocalAgentError } from '../../shared/local-agent-error';

const npmEntries: Record<LocalAgentDriver, string[]> = {
  codex: ['node_modules/@openai/codex/bin/codex.js'],
  claude: [
    'node_modules/@anthropic-ai/claude-code/bin/claude.exe',
    'node_modules/@anthropic-ai/claude-code/cli.js',
  ],
  pi: [
    'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js',
    'node_modules/@earendil-works/pi-coding-agent/dist/cli.js',
    'node_modules/@mariozechner/pi-coding-agent/dist/cli.js',
  ],
  dsh: ['node_modules/@deepseek-ai/dsh/lib/bin.js'],
  antigravity: [],
};

/** Resolve known npm launchers to files; never execute or interpret a shell shim. */
export function resolveNativeExecutable(
  input: string,
  driver: LocalAgentDriver,
  options: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    nodeExecutable?: string;
    isFile?: (path: string) => boolean;
  } = {},
): { executable: string; args: string[]; env: Record<string, string>; sdkPath: string } {
  if ((options.platform ?? process.platform) !== 'win32')
    return { executable: input, args: [], env: {}, sdkPath: input };
  const isFile =
    options.isFile ??
    ((path) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    });
  const env = options.env ?? process.env;
  const path = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  const suffixes = win32.extname(input) ? [''] : ['.exe', '.com', '.cmd', '.bat'];
  const candidates = /[\\/]/.test(input)
    ? suffixes.map((suffix) => `${input}${suffix}`)
    : path
        .split(';')
        .filter(Boolean)
        .flatMap((directory) =>
          suffixes.map((suffix) =>
            win32.join(directory.replace(/^"|"$/g, ''), `${input}${suffix}`),
          ),
        );
  let executable = candidates.find(isFile);
  if (!executable) throw new LocalAgentError('LOCAL_AGENT_NOT_INSTALLED');
  const extension = win32.extname(executable).toLowerCase();
  if (['.cmd', '.bat', '.ps1'].includes(extension)) {
    if (win32.basename(executable, extension).toLowerCase() !== driver)
      throw new LocalAgentError('LOCAL_AGENT_NOT_INSTALLED');
    const directory = win32.dirname(executable);
    executable = npmEntries[driver].map((path) => win32.join(directory, path)).find(isFile);
    if (!executable) throw new LocalAgentError('LOCAL_AGENT_NOT_INSTALLED');
  }
  if (/\.[cm]?js$/i.test(executable))
    return {
      executable: options.nodeExecutable ?? process.execPath,
      args: [executable],
      env: { ELECTRON_RUN_AS_NODE: '1' },
      sdkPath: executable,
    };
  return { executable, args: [], env: {}, sdkPath: executable };
}

/** Accept version tokens only; diagnostics and protocol names never become UI metadata. */
export function nativeVersion(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 80) return undefined;
  return value.trim().match(/^v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)$/u)?.[1];
}

/** Optional, prompt-free metadata from this instance's executable. Never relay stdout/stderr. */
export async function probeNativeVersion(
  connection: LocalAgentConnection,
  cwd: string,
): Promise<string | undefined> {
  if (connection.driver !== 'claude' && connection.driver !== 'pi') return undefined;
  try {
    const launch = resolveNativeExecutable(connection.executablePath, connection.driver);
    const homeVariable =
      connection.driver === 'claude' ? 'CLAUDE_CONFIG_DIR' : 'PI_CODING_AGENT_DIR';
    return await new Promise((resolve) => {
      execFile(
        launch.executable,
        [...launch.args, '--version'],
        {
          cwd,
          env: {
            ...process.env,
            ...launch.env,
            ...(connection.homePath ? { [homeVariable]: connection.homePath } : {}),
          },
          shell: false,
          windowsHide: true,
          timeout: 2000,
          killSignal: 'SIGKILL',
          maxBuffer: 4096,
          encoding: 'utf8',
        },
        (error, stdout) =>
          resolve(
            error
              ? undefined
              : nativeVersion(
                  connection.driver === 'claude'
                    ? stdout.trim().replace(/ \(Claude Code\)$/u, '')
                    : stdout,
                ),
          ),
      );
    });
  } catch {
    // Unsupported version commands must not discard an otherwise valid native catalog.
    return undefined;
  }
}
