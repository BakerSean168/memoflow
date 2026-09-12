/**
 * Data Portability — IPC Handler Integration Test
 *
 * Verifies that the composed DataPortabilityElectronModule.register() installs
 * handlers that can be invoked through the mock ipcMain, and that the full
 * handler → use case → PowerSync path works end-to-end. The module handle is
 * built through the desktop runtime composer (instance-bound), never through a
 * retired package-global constant.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IElectronDatabase, IElectronModuleContext } from '@memoflow/contracts/electron';
import { UserDataExportEnvelopeV2Schema } from '@memoflow/contracts/data-portability';
import { DataPortabilityChannels } from '@memoflow/contracts/electron';
import type { DataPortabilityElectronModuleDef } from '@memoflow/data-portability/electron';
import { composeDataPortability } from '../../runtime/compose-data-portability';

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

function createFakeDb(): IElectronDatabase {
  return {
    execute: vi.fn(async () => ({ rowsAffected: 1 })),
    getAll: vi.fn(async (sql: string) => {
      if (sql.includes('FROM user_preference_records')) {
        const timestamp = '2026-09-10T00:00:00.000Z';
        return [
          {
            id: 'preference-presentation-1',
            identity_id: 'identity-test',
            namespace: 'presentation',
            payload: JSON.stringify({ theme: 'dark', language: 'en-US' }),
            revision: 1,
            created_at: timestamp,
            updated_at: timestamp,
          },
          {
            id: 'preference-regional-1',
            identity_id: 'identity-test',
            namespace: 'regional',
            payload: JSON.stringify({
              timeZone: 'UTC',
              dateStyle: 'medium',
              timeStyle: '24h',
              weekStartsOn: 1,
            }),
            revision: 1,
            created_at: timestamp,
            updated_at: timestamp,
          },
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
  } as unknown as IElectronDatabase;
}

function createContext(): IElectronModuleContext {
  return {
    db: createFakeDb(),
    auth: {
      requireRequestContext: vi.fn(async () => ({
        identityId: 'identity-test',
        sessionId: 'session-test',
        accountUuid: 'identity-test',
      })),
    },
  } as unknown as IElectronModuleContext;
}

type IpcHandler = (_event: unknown, dto: unknown) => Promise<unknown>;

function getHandler(channel: string): IpcHandler {
  const call = electronMock.handle.mock.calls.find(([ch]) => ch === channel);
  expect(call, `Expected handler for channel ${channel} to be registered`).toBeTruthy();
  return call![1] as IpcHandler;
}

function registerModule(context: IElectronModuleContext): DataPortabilityElectronModuleDef {
  const module = composeDataPortability({ db: context.db });
  module.register(context);
  return module;
}

describe('DataPortabilityElectronModule IPC handler integration', () => {
  beforeEach(() => {
    electronMock.handle.mockClear();
    electronMock.removeHandler.mockClear();
  });

  it('registers export and import handlers with shared channel constants', () => {
    registerModule(createContext());

    const registeredChannels = electronMock.handle.mock.calls.map(([ch]) => ch);
    expect(registeredChannels).toContain(DataPortabilityChannels.EXPORT);
    expect(registeredChannels).toContain(DataPortabilityChannels.IMPORT);
    expect(registeredChannels).toHaveLength(2);
  });

  it('export handler returns a valid envelope with fileName, content, and summary', async () => {
    registerModule(createContext());
    const handler = getHandler(DataPortabilityChannels.EXPORT);
    const result = (await handler({}, { include: ['settings'] })) as {
      ok: boolean;
      data: { fileName: string; content: string; summary: { entityCounts: Record<string, number>; warnings: string[] } };
    };

    expect(result).toMatchObject({
      ok: true,
      data: {
        fileName: expect.stringMatching(/\.json$/),
        content: expect.any(String),
        summary: {
          entityCounts: expect.any(Object),
          warnings: expect.any(Array),
        },
      },
    });

    const envelope = UserDataExportEnvelopeV2Schema.parse(JSON.parse(result.data.content));
    expect(envelope.kind).toBe('memoflow.user-data-export');
    expect(envelope.schemaVersion).toBe(2);
    expect(envelope).toHaveProperty('data');
    expect(envelope.data.settings?.preferences).toEqual({
      presentation: { theme: 'dark', language: 'en-US' },
      regional: { timeZone: 'UTC', dateStyle: 'medium', timeStyle: '24h', weekStartsOn: 1 },
    });
  });

  it('import handler succeeds with valid export content', async () => {
    registerModule(createContext());

    // First export to get valid content
    const exportHandler = getHandler(DataPortabilityChannels.EXPORT);
    const exportResult = (await exportHandler({}, { include: ['settings'] })) as {
      ok: boolean;
      data: { content: string };
    };
    const { content } = exportResult.data;

    // Import the exported content
    const importHandler = getHandler(DataPortabilityChannels.IMPORT);
    const importResult = (await importHandler({}, { content, dryRun: false })) as {
      ok: boolean;
      data: { batchId: string; dryRun: boolean; created: Record<string, number>; updatedSingletons: Record<string, number>; warnings: string[] };
    };

    expect(importResult).toMatchObject({
      ok: true,
      data: {
        batchId: expect.any(String),
        dryRun: false,
        created: expect.any(Object),
        updatedSingletons: expect.any(Object),
        warnings: expect.any(Array),
      },
    });
  });

  it('import handler rejects content with banned identity fields', async () => {
    registerModule(createContext());

    // Export first to get a valid envelope, then inject a banned field
    const exportHandler = getHandler(DataPortabilityChannels.EXPORT);
    const exportResult = (await exportHandler({}, { include: ['settings'] })) as {
      ok: boolean;
      data: { content: string };
    };
    const envelope = JSON.parse(exportResult.data.content);
    envelope.data.settings.preferences.presentation.identityId = 'stolen-identity';

    const importHandler = getHandler(DataPortabilityChannels.IMPORT);
    const importResult = (await importHandler({}, { content: JSON.stringify(envelope) })) as {
      ok: boolean;
      error: { code: string };
    };

    expect(importResult).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
      },
    });
  });

  it('destroy removes all registered handlers', () => {
    const module = registerModule(createContext());
    module.destroy?.();

    expect(electronMock.removeHandler).toHaveBeenCalledWith(DataPortabilityChannels.EXPORT);
    expect(electronMock.removeHandler).toHaveBeenCalledWith(DataPortabilityChannels.IMPORT);
    expect(electronMock.removeHandler).toHaveBeenCalledTimes(2);
  });
});
