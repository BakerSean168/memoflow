import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { LabelChannels } from '@memoflow/desktop-contracts';
import { createLabelElectronModule } from './label.electron-module';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

beforeEach(() => {
  handlers.clear();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as (...args: unknown[]) => unknown);
  });
  vi.mocked(ipcMain.removeHandler).mockImplementation((channel) => {
    handlers.delete(channel);
  });
});

describe('Label Electron module', () => {
  it('injects authenticated identity and returns current-user DTOs only', async () => {
    const service = {
      list: vi.fn().mockResolvedValue([
        {
          id: 'label-1',
          identityId: 'identity-1',
          name: 'Work',
          normalizedName: 'work',
          color: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ]),
      create: vi.fn(),
    };
    const module = createLabelElectronModule({ service });
    module.register({
      db: {} as never,
      auth: { requireRequestContext: vi.fn().mockResolvedValue({ identityId: 'identity-1' }) },
    });

    const result = await handlers.get(LabelChannels.LIST)?.({}, { search: 'work' });
    expect(service.list).toHaveBeenCalledWith({ identityId: 'identity-1', search: 'work' });
    expect(result).toMatchObject({
      ok: true,
      data: [{ id: 'label-1', name: 'Work', color: null, createdAt: 1, updatedAt: 2 }],
    });
    expect(JSON.stringify(result)).not.toContain('identity-1');
    module.destroy?.();
  });

  it('validates create before calling the LabelService', async () => {
    const service = { list: vi.fn(), create: vi.fn() };
    const module = createLabelElectronModule({ service });
    module.register({
      db: {} as never,
      auth: { requireRequestContext: vi.fn().mockResolvedValue({ identityId: 'identity-1' }) },
    });

    const invalid = await handlers.get(LabelChannels.CREATE)?.({}, { name: '' });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(service.create).not.toHaveBeenCalled();
    module.destroy?.();
  });
});
