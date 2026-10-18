import path from 'node:path';
import { app } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDesktopUserFilesPath } from './user-data-path';

describe('resolveDesktopUserFilesPath', () => {
  const previousOverride = process.env.MEMOFLOW_DESKTOP_USER_FILES_PATH;
  const home = path.join(path.sep, 'home', 'dev');
  const userData = path.join(home, '.config', 'MemoFlow', 'MemoFlow-Dev');
  let documentsPath: string;

  beforeEach(() => {
    delete process.env.MEMOFLOW_DESKTOP_USER_FILES_PATH;
    documentsPath = home;
    vi.spyOn(app, 'getPath').mockImplementation((name) => {
      switch (name) {
        case 'home':
          return home;
        case 'documents':
          return documentsPath;
        case 'userData':
          return userData;
        default:
          throw new Error('Unexpected Electron app path: ' + name);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousOverride === undefined) {
      delete process.env.MEMOFLOW_DESKTOP_USER_FILES_PATH;
    } else {
      process.env.MEMOFLOW_DESKTOP_USER_FILES_PATH = previousOverride;
    }
  });

  it('does not create a top-level MemoFlow Files path when Documents resolves to home', () => {
    expect(resolveDesktopUserFilesPath('development')).toBe(path.join(userData, 'files'));
  });

  it('keeps the existing Documents-based path when a separate Documents folder is configured', () => {
    documentsPath = path.join(home, 'Documents');
    expect(resolveDesktopUserFilesPath('production')).toBe(
      path.join(documentsPath, 'MemoFlow Files'),
    );
    expect(resolveDesktopUserFilesPath('development')).toBe(
      path.join(documentsPath, 'MemoFlow Files Dev'),
    );
  });

  it('respects an explicit user-files override even when Documents falls back to home', () => {
    const chosen = path.join(home, 'my-files');
    process.env.MEMOFLOW_DESKTOP_USER_FILES_PATH = chosen;
    expect(resolveDesktopUserFilesPath('development')).toBe(chosen);
  });
});
