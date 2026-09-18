import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DataPortabilityChannels, type IElectronModuleContext } from '@memoflow/contracts/electron';
import type { PortableCapability } from '@memoflow/contracts/data-portability';
import type { DataPortabilityElectronModuleDef } from '@memoflow/data-portability/electron';
import { composeDataPortability } from '../../runtime/compose-data-portability';

const electronMock = vi.hoisted(() => ({ handle: vi.fn(), removeHandler: vi.fn() }));

vi.mock('electron', () => ({
  ipcMain: { handle: electronMock.handle, removeHandler: electronMock.removeHandler },
}));

const preferencesCapability: PortableCapability<{ theme: string }> = {
  key: 'preferences',
  schemaVersion: 3,
  payloadSchema: z.object({ theme: z.string() }).strict(),
  export: vi.fn(async () => ({ theme: 'dark' })),
  dryRun: vi.fn(async () => ({ created: 0, updated: 0, skipped: 1, warnings: [] })),
  apply: vi.fn(async () => ({ created: 0, updated: 0, skipped: 1, warnings: [] })),
};

function createContext(): IElectronModuleContext {
  return {
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
  const call = electronMock.handle.mock.calls.find(([registeredChannel]) => registeredChannel === channel);
  expect(call, `Expected handler for channel ${channel} to be registered`).toBeTruthy();
  return call![1] as IpcHandler;
}

function registerModule(context: IElectronModuleContext): DataPortabilityElectronModuleDef {
  const module = composeDataPortability({ portableCapabilities: [preferencesCapability] });
  module.register(context);
  return module;
}

describe('DataPortabilityElectronModule V3 IPC surface', () => {
  beforeEach(() => {
    electronMock.handle.mockClear();
    electronMock.removeHandler.mockClear();
    vi.clearAllMocks();
  });

  it('registers only the V3 export, dry-run and apply channels', () => {
    const module = registerModule(createContext());
    const registeredChannels = electronMock.handle.mock.calls.map(([channel]) => channel);
    expect(registeredChannels).toEqual([
      DataPortabilityChannels.EXPORT,
      DataPortabilityChannels.DRY_RUN,
      DataPortabilityChannels.APPLY,
    ]);
    module.destroy?.();
  });

  it('exports V3 data and round-trips through dry-run then apply', async () => {
    const module = registerModule(createContext());
    const exportResult = (await getHandler(DataPortabilityChannels.EXPORT)({}, {
      capabilities: ['preferences'],
    })) as { ok: boolean; data: { content: string; summary: { capabilityKeys: string[] } } };
    expect(exportResult.ok).toBe(true);
    expect(exportResult.data.summary.capabilityKeys).toEqual(['preferences']);
    const envelope = JSON.parse(exportResult.data.content) as {
      format: string;
      schemaVersion: number;
    };
    expect(envelope).toMatchObject({ format: 'memoflow.user-data-export', schemaVersion: 3 });

    const dryRun = (await getHandler(DataPortabilityChannels.DRY_RUN)({}, {
      content: exportResult.data.content,
    })) as { ok: boolean; data: { dryRun: boolean } };
    const apply = (await getHandler(DataPortabilityChannels.APPLY)({}, {
      content: exportResult.data.content,
    })) as { ok: boolean; data: { dryRun: boolean } };
    expect(dryRun).toMatchObject({ ok: true, data: { dryRun: true } });
    expect(apply).toMatchObject({ ok: true, data: { dryRun: false } });
    module.destroy?.();
  });

  it('rejects malformed and banned V3 input with structured validation errors', async () => {
    const module = registerModule(createContext());
    const malformed = await getHandler(DataPortabilityChannels.DRY_RUN)({}, { content: '{bad json' });
    expect(malformed).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });

    const exported = (await getHandler(DataPortabilityChannels.EXPORT)({}, {})) as {
      data: { content: string };
    };
    const envelope = JSON.parse(exported.data.content) as {
      capabilities: Array<{ payload: Record<string, unknown> }>;
    };
    envelope.capabilities[0]!.payload.identityId = 'source-identity';
    const banned = await getHandler(DataPortabilityChannels.DRY_RUN)({}, {
      content: JSON.stringify(envelope),
    });
    expect(banned).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    module.destroy?.();
  });

  it('removes all registered handlers on destroy', () => {
    const module = registerModule(createContext());
    module.destroy?.();
    expect(electronMock.removeHandler).toHaveBeenCalledTimes(3);
    for (const channel of Object.values(DataPortabilityChannels)) {
      expect(electronMock.removeHandler).toHaveBeenCalledWith(channel);
    }
  });
});
