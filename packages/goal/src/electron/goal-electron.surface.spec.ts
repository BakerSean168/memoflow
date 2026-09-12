import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GoalChannels } from '@memoflow/contracts/electron';
import { createTimeContext } from '@memoflow/time';

const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
};

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

/**
 * Goal electron seam surface (stage-6 residual):
 * Channel registration must use contracts GoalChannels only — no dual-track local Ch map.
 */
describe('createGoalElectronModule channel surface', () => {
  const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

  it('registers handlers via GoalChannels and does not redefine a local Ch map', () => {
    expect(source).toContain('GoalChannels');
    expect(source).toContain("from '@memoflow/contracts/electron'");
    expect(source).not.toMatch(/const Ch = \{/);
    expect(source).toContain('Object.values(GoalChannels)');
    expect(source).toContain('GoalChannels.LIST');
    expect(source).toContain('GoalChannels.ABANDON');
    expect(source).not.toContain('GoalChannels.ARCHIVE_EXPIRED');
    expect(source).not.toContain('GoalChannels.FOLDER_LIST');
    expect(source).not.toContain('GoalChannels.FOCUS_MODE_GET');
  });

  it('keeps canonical Goal vNext status channels on contracts surface', () => {
    expect(GoalChannels.PLAN).toBe('goal:plan');
    expect(GoalChannels.ABANDON).toBe('goal:abandon');
    expect(GoalChannels.COMPLETE).toBe('goal:complete');
    expect('ARCHIVE_EXPIRED' in GoalChannels).toBe(false);
  });
});

function createPowerSyncDb() {
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const sqlite = new Database(':memory:');
  const wrapper = {
    execute: async (sql: string, p?: unknown[]) => {
      const info = sqlite.prepare(sql).run(...(p ?? []));
      return { rowsAffected: info.changes };
    },
    getAll: async <T>(sql: string, p?: unknown[]) => sqlite.prepare(sql).all(...(p ?? [])) as T[],
    getOptional: async <T>(sql: string, p?: unknown[]) =>
      (sqlite.prepare(sql).get(...(p ?? [])) as T) ?? null,
    get: async <T>(sql: string, p?: unknown[]) => {
      const row = sqlite.prepare(sql).get(...(p ?? []));
      if (!row) throw new Error(`no rows: ${sql}`);
      return row as T;
    },
    writeTransaction: async <T>(cb: (tx: unknown) => Promise<T>) => {
      sqlite.exec('BEGIN');
      try {
        const r = await cb(wrapper);
        sqlite.exec('COMMIT');
        return r;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return wrapper;
}

describe('GoalElectronModule.register() startup (W4 P2-1)', () => {
  it('composes without throwing when the host provides the Task binding port (fail-closed gate)', async () => {
    const db = createPowerSyncDb();
    const { createGoalPowerSyncModule } = await import('../server/infrastructure/powersync');
    expect(() =>
      createGoalPowerSyncModule(db, {
        taskBindingReadPort: {
          checkActiveTaskBindings: async () => ({ hasActiveBindings: false, activeCount: 0 }),
        },
        userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
        relationCleanupFactory: () => ({ unlinkAllForGoal: async () => 0 }),
      }),
    ).not.toThrow();
  });

  it('fails closed when the Task binding port is NOT provided', async () => {
    const db = createPowerSyncDb();
    const { createGoalPowerSyncModule } = await import('../server/infrastructure/powersync');
    expect(() => createGoalPowerSyncModule(db)).toThrow(/taskBindingReadPort/);
  });
});

describe('GoalElectronModule.register() lifecycle (W4 P2-1)', () => {
  it('registers IPC handlers and starts the bound instance (transport-only)', async () => {
    const { createGoalElectronModule } = await import('./index');
    const start = vi.fn();
    const dispose = vi.fn();
    const instance = { api: {}, start, dispose } as never;
    const module = createGoalElectronModule({ instance });

    const ctx = {
      db: {},
      auth: { requireRequestContext: async () => ({ identityId: 'identity-1' }) },
    };
    expect(() => module.register(ctx as never)).not.toThrow();
    expect(start).toHaveBeenCalledTimes(1);

    // IPC handlers were actually registered on the (mocked) ipcMain
    const { ipcMain } = await import('electron');
    expect((ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);

    module.destroy?.();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
