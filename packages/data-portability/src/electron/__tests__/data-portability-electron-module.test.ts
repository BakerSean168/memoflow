import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IElectronDatabase, IElectronModuleContext } from '@memoflow/contracts/electron';
import { createPowerSyncDataPortabilityModule } from '../../server/infrastructure/data-portability.module';
import { createDataPortabilityRuntimeContribution } from '../../server/infrastructure/runtime';
import { createDataPortabilityElectronModule } from '../index';

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  removeHandler: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: electronMock.handle,
    removeHandler: electronMock.removeHandler,
  },
}));

function createContext(): IElectronModuleContext {
  const db: IElectronDatabase = {
    execute: vi.fn(async () => ({ rowsAffected: 1 })),
    getAll: vi.fn(async (sql: string) => {
      if (sql.includes('FROM user_preference_records')) {
        return [
          { id: 'pref-presentation', identity_id: 'identity-1', namespace: 'presentation', payload: '{\"theme\":\"dark\",\"language\":\"en-US\"}', revision: 1, created_at: 1, updated_at: 1 },
          { id: 'pref-regional', identity_id: 'identity-1', namespace: 'regional', payload: '{\"timeZone\":\"UTC\",\"dateStyle\":\"medium\",\"timeStyle\":\"24h\",\"weekStartsOn\":1}', revision: 1, created_at: 1, updated_at: 1 },
        ];
      }
      return [];
    }),
    get: vi.fn(async () => ({})),
    getOptional: vi.fn(async () => null),
    writeTransaction: vi.fn(async (callback) =>
      callback({
        execute: vi.fn(async () => ({ rowsAffected: 1 })),
        getAll: vi.fn(async () => []),
        get: vi.fn(async () => ({})),
        getOptional: vi.fn(async () => null),
      }),
    ),
  };

  return {
    db,
    auth: {
      requireRequestContext: vi.fn(async () => ({
        identityId: 'identity-1',
        sessionId: 'session-1',
        accountUuid: 'identity-1',
      })),
    },
  } as unknown as IElectronModuleContext;
}

function createModule(context: IElectronModuleContext) {
  const instance = createPowerSyncDataPortabilityModule(context.db, {
    runtimeContributions: createDataPortabilityRuntimeContribution(),
  });
  return createDataPortabilityElectronModule({ instance });
}

describe('DataPortabilityElectronModule', () => {
  beforeEach(() => {
    electronMock.handle.mockClear();
    electronMock.removeHandler.mockClear();
  });

  it('registers export and import IPC handlers and removes them on destroy', async () => {
    const module = createModule(createContext());
    module.register(createContext());
    module.destroy?.();

    expect(electronMock.handle).toHaveBeenCalledWith('data-portability:export', expect.any(Function));
    expect(electronMock.handle).toHaveBeenCalledWith('data-portability:import', expect.any(Function));
    expect(electronMock.removeHandler).toHaveBeenCalledWith('data-portability:export');
    expect(electronMock.removeHandler).toHaveBeenCalledWith('data-portability:import');
  });

  it('returns Result-wrapped export data through the authenticated handler', async () => {
    const module = createModule(createContext());
    module.register(createContext());
    const exportHandler = electronMock.handle.mock.calls.find(
      ([channel]) => channel === 'data-portability:export',
    )?.[1] as (_event: unknown, dto: unknown) => Promise<unknown>;

    const result = await exportHandler({}, { include: ['settings'] });

    expect(result).toMatchObject({
      ok: true,
      data: {
        summary: { entityCounts: { settings: 1 } },
      },
    });
    expect(JSON.stringify(result)).not.toContain('identity-1');
  });

  it('returns structured validation errors for invalid import content', async () => {
    const module = createModule(createContext());
    module.register(createContext());
    const importHandler = electronMock.handle.mock.calls.find(
      ([channel]) => channel === 'data-portability:import',
    )?.[1] as (_event: unknown, dto: unknown) => Promise<unknown>;

    const result = await importHandler({}, { content: '{bad json' });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid JSON content',
        details: undefined,
        context: undefined,
      },
    });
  });

  it('validates export IPC payloads with the shared contract schema', async () => {
    const module = createModule(createContext());
    module.register(createContext());
    const exportHandler = electronMock.handle.mock.calls.find(
      ([channel]) => channel === 'data-portability:export',
    )?.[1] as (_event: unknown, dto: unknown) => Promise<unknown>;

    const result = await exportHandler({}, { include: ['not-a-module'] });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
      },
    });
  });

  it('validates import IPC payloads with the shared contract schema', async () => {
    const module = createModule(createContext());
    module.register(createContext());
    const importHandler = electronMock.handle.mock.calls.find(
      ([channel]) => channel === 'data-portability:import',
    )?.[1] as (_event: unknown, dto: unknown) => Promise<unknown>;

    const result = await importHandler({}, { dryRun: true });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
      },
    });
  });
});
