import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CacheChannels,
  DashboardChannels,
  GoalChannels,
  TaskChannels,
} from '@memoflow/contracts/electron';

/**
 * IPC cache management surface (stage-6 residual):
 * Cache management handlers and TTL keys use contracts channel maps.
 */
describe('ipc-cache channel surface', () => {
  const source = readFileSync(resolve(__dirname, 'ipc-cache.ts'), 'utf8');

  it('registers cache management handlers via CacheChannels', () => {
    expect(source).toContain('CacheChannels.STATS');
    expect(source).toContain('CacheChannels.CLEAR');
    expect(source).toContain('CacheChannels.INVALIDATE');
    expect(source).not.toMatch(/ipcMain\.handle\(\s*'cache:/);
  });

  it('returns contracts Result ok envelopes for cache management handlers', () => {
    expect(source).toContain("import { ok } from '@memoflow/contracts/result'");
    expect(source).toContain('return ok(');
    expect(source).not.toMatch(/success:\s*true/);
  });

  it('configures list TTL keys via contracts channel constants', () => {
    expect(source).toContain('GoalChannels.LIST');
    expect(source).toContain('TaskChannels.PLAN_LIST');
    expect(source).toContain('DashboardChannels.GET_STATS');
    expect(GoalChannels.LIST).toBe('goal:list');
    expect(CacheChannels.STATS).toBe('cache:stats');
  });
});
