import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { configureDesktopStorage } from './storage-bootstrap';
import { resolveDesktopStorageRoots } from './paths/desktop-storage-roots';

describe('early storage bootstrap', () => {
  it('sets both Electron roots before ready/session and creates only required private paths', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-bootstrap-'));
    try {
      const roots = resolveDesktopStorageRoots({
        platform: 'linux',
        channel: 'test',
        home,
        env: {},
      });
      const events: string[] = [];
      const app = {
        isReady: () => false,
        setPath: (name: string, value: string) => {
          expect(fs.statSync(value).isDirectory()).toBe(true);
          events.push(name);
        },
        setAppLogsPath: (value: string) => {
          expect(value).toBe(roots.logsDir);
          events.push('logs');
        },
      };
      configureDesktopStorage(app, roots);
      events.push('ready', 'session');
      expect(events).toEqual(['userData', 'sessionData', 'logs', 'ready', 'session']);
      for (const dir of ['Documents', 'Downloads', 'MemoFlow Files'])
        expect(fs.existsSync(path.join(home, dir))).toBe(false);
      expect(fs.existsSync(roots.cacheRoot)).toBe(false);
      const setPath = vi.fn();
      expect(() =>
        configureDesktopStorage({ ...app, isReady: () => true, setPath }, roots),
      ).toThrow('before Electron ready');
      expect(setPath).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
