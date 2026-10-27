import { afterEach, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import type { LocalAgentConnection } from '@memoflow/ai-contracts';
import { nativeVersion, probeNativeVersion, resolveNativeExecutable } from './native-executable';
it('resolves Windows npm launchers with space paths to Node argv without a shell', () => {
  const root = 'C:\\Users\\Test User\\AppData\\Roaming\\npm';
  const files = new Set([
    `${root}\\codex.cmd`,
    `${root}\\node_modules\\@openai\\codex\\bin\\codex.js`,
  ]);
  expect(
    resolveNativeExecutable('codex', 'codex', {
      platform: 'win32',
      env: { PATH: root },
      isFile: (path) => files.has(path),
      nodeExecutable: 'C:\\MemoFlow\\MemoFlow.exe',
    }),
  ).toEqual({
    executable: 'C:\\MemoFlow\\MemoFlow.exe',
    args: [`${root}\\node_modules\\@openai\\codex\\bin\\codex.js`],
    env: { ELECTRON_RUN_AS_NODE: '1' },
    sdkPath: `${root}\\node_modules\\@openai\\codex\\bin\\codex.js`,
  });
});
it('uses the native Claude executable behind its npm shim and rejects an unknown shim', () => {
  const files = new Set([
    'C:\\npm\\claude.cmd',
    'C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe',
  ]);
  const options = {
    platform: 'win32' as const,
    env: { PATH: 'C:\\npm' },
    isFile: (path: string) => files.has(path),
  };
  expect(resolveNativeExecutable('claude', 'claude', options).executable).toBe(
    'C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe',
  );
  files.add('C:\\npm\\custom.cmd');
  expect(() => resolveNativeExecutable('C:\\npm\\custom.cmd', 'pi', options)).toThrow();
});
it('preserves an explicitly selected POSIX wrapper and leaves its arguments separate', () => {
  expect(
    resolveNativeExecutable('/home/test/Agent wrapper', 'claude', { platform: 'linux' }),
  ).toEqual({
    executable: '/home/test/Agent wrapper',
    args: [],
    env: {},
    sdkPath: '/home/test/Agent wrapper',
  });
});

it('uses an installed DSH npm binary instead of executing the Windows cmd shim', () => {
  const root = 'C:\\Users\\Test\\AppData\\Roaming\\npm';
  const files = new Set([
    `${root}\\dsh.cmd`,
    `${root}\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js`,
  ]);
  expect(
    resolveNativeExecutable('dsh', 'dsh', {
      platform: 'win32',
      env: { PATH: root },
      isFile: (path) => files.has(path),
      nodeExecutable: 'C:\\MemoFlow\\MemoFlow.exe',
    }),
  ).toEqual({
    executable: 'C:\\MemoFlow\\MemoFlow.exe',
    args: [`${root}\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js`],
    env: { ELECTRON_RUN_AS_NODE: '1' },
    sdkPath: `${root}\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js`,
  });
});

const versionResponse = vi.hoisted((): { error: Error | null; stdout: string } => ({
  error: null,
  stdout: '',
}));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFile: vi.fn(
    (
      _file: string,
      _args: string[],
      _options: object,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => callback(versionResponse.error, versionResponse.stdout, 'private diagnostic'),
  ),
}));
afterEach(() => {
  versionResponse.error = null;
  versionResponse.stdout = '';
});

const versionConnection: LocalAgentConnection = {
  id: 'test',
  driver: 'claude',
  name: 'Test',
  executablePath: process.execPath,
  homePath: '/isolated/native home',
  enabled: true,
  writeScopes: [],
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
};
it('runs only --version on the selected executable with bounded output and the instance home', async () => {
  versionResponse.stdout = '2.1.31 (Claude Code)\n';
  expect(await probeNativeVersion(versionConnection, '/tmp')).toBe('2.1.31');
  expect(execFile).toHaveBeenLastCalledWith(
    process.execPath,
    ['--version'],
    expect.objectContaining({
      cwd: '/tmp',
      shell: false,
      windowsHide: true,
      timeout: 2000,
      maxBuffer: 4096,
      killSignal: 'SIGKILL',
      env: expect.objectContaining({ CLAUDE_CONFIG_DIR: '/isolated/native home' }),
    }),
    expect.any(Function),
  );
  versionResponse.stdout = '1.0.3\n';
  expect(
    await probeNativeVersion({ ...versionConnection, driver: 'pi', homePath: '/other/pi' }, '/tmp'),
  ).toBe('1.0.3');
  expect(execFile).toHaveBeenLastCalledWith(
    process.execPath,
    ['--version'],
    expect.objectContaining({
      env: expect.objectContaining({ PI_CODING_AGENT_DIR: '/other/pi' }),
    }),
    expect.any(Function),
  );
});
it('omits failed, timed out or oversized version-command output instead of exposing diagnostics', async () => {
  versionResponse.error = new Error('command failed, timed out or exceeded maxBuffer');
  versionResponse.stdout = '2.1.31';
  expect(await probeNativeVersion(versionConnection, '/tmp')).toBeUndefined();
});
it.each([
  'SDK 0.3.295',
  'ACP v1',
  '2.4.1\nprivate diagnostic',
  '2.4.1\u2028private diagnostic',
  '2.4.1\u001b[31m',
  '1'.repeat(81),
  null,
])('does not turn arbitrary metadata %j into a version', (value) => {
  expect(nativeVersion(value)).toBeUndefined();
});
it.each(['2.4.1', 'v1.0.3', '1.2.3-rc.1+build.2'])(
  'preserves a recognized native version %s',
  (value) => {
    expect(nativeVersion(value)).toBe(value.replace(/^v/u, ''));
  },
);

it('resolves the official Windows AGY ACP executable without a shell or npm fallback', () => {
  const root = 'C:\\Native Agents';
  const files = new Set([root + '\\agy_acp_server.exe']);
  const options = {
    platform: 'win32' as const,
    env: { PATH: root },
    isFile: (path: string) => files.has(path),
  };
  expect(resolveNativeExecutable('agy_acp_server', 'antigravity', options)).toEqual({
    executable: root + '\\agy_acp_server.exe',
    sdkPath: root + '\\agy_acp_server.exe',
    args: [],
    env: {},
  });
  files.add(root + '\\agy.cmd');
  expect(() => resolveNativeExecutable('agy', 'antigravity', options)).toThrow();
});
