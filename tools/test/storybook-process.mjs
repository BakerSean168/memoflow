import { spawn } from 'node:child_process';
import { constants } from 'node:os';

// Own the complete Storybook/Vitest/Chromium process group, including on Ctrl-C.
export function startStorybookProcess(command, args, options = {}) {
  const grouped = process.platform !== 'win32';
  const child = spawn(command, args, { stdio: 'inherit', ...options, detached: grouped });
  let timer;
  function kill(signal) {
    if (!child.pid) return false;
    try {
      if (grouped) process.kill(-child.pid, signal);
      else child.kill(signal);
      return true;
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
      return false;
    }
  }
  function stop(signal = 'SIGTERM') {
    if (kill(signal) && !timer) {
      timer = setTimeout(() => kill('SIGKILL'), 2000);
      timer.unref();
    }
  }
  const onInt = () => stop('SIGINT');
  const onTerm = () => stop('SIGTERM');
  const onExit = () => kill('SIGKILL');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  process.on('exit', onExit);
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve(code ?? 128 + (constants.signals[signal] ?? 1));
    });
  }).finally(() => {
    clearTimeout(timer);
    // No descendant may keep a browser or Vite port after the owner exits.
    kill('SIGKILL');
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
    process.off('exit', onExit);
  });
  return { child, done, stop };
}
