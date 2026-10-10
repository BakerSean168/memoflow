import { expect, it } from 'vitest';
import { resolveNativeExecutable } from './native-executable';
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
