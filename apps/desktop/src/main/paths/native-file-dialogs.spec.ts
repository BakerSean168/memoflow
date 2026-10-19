import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NativeFileDialogs } from './native-file-dialogs';

describe('native user file interactions', () => {
  it('canceling import/export creates zero directories or files in a fresh HOME', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'native-dialog-home-'));
    try {
      const dialogs = {
        showSaveDialog: vi.fn(async () => ({ canceled: true })),
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
      };
      const files = new NativeFileDialogs(path.join(home, '.config/memoflow'), dialogs, () => home);
      expect(await files.save({ defaultFileName: 'backup.json', content: 'secret' })).toEqual({
        canceled: true,
        filePath: null,
      });
      expect(await files.open()).toEqual({ canceled: true, filePath: null, content: null });
      expect(await fs.readdir(home)).toEqual([]);
      expect(dialogs.showSaveDialog).toHaveBeenCalledWith({
        defaultPath: path.join(home, 'backup.json'),
        filters: undefined,
      });
      expect(dialogs.showOpenDialog).toHaveBeenCalledWith({
        defaultPath: home,
        properties: ['openFile'],
        filters: undefined,
      });
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });
  it('reports a saved file even when the preference writer fails', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'native-dialog-preference-'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const config = path.join(home, 'config');
      await fs.mkdir(config);
      const filePath = path.join(home, 'saved.json');
      const write = fs.writeFile.bind(fs);
      const writer = vi.spyOn(fs, 'writeFile').mockImplementation(async (file, ...args) => {
        if (file === path.join(config, 'file-dialog-directory.json'))
          throw new Error('preference unavailable');
        return write(file, ...args);
      });
      try {
        const files = new NativeFileDialogs(
          config,
          {
            showSaveDialog: async () => ({ canceled: false, filePath }),
            showOpenDialog: async () => ({ canceled: false, filePaths: [filePath] }),
          },
          () => home,
        );
        await expect(
          files.save({ defaultFileName: 'saved.json', content: 'saved' }),
        ).resolves.toEqual({ canceled: false, filePath });
        expect(await fs.readFile(filePath, 'utf8')).toBe('saved');
        await expect(files.open()).resolves.toEqual({
          canceled: false,
          filePath,
          content: 'saved',
        });
        expect(warning).toHaveBeenCalledTimes(2);
      } finally {
        writer.mockRestore();
      }
    } finally {
      warning.mockRestore();
      await fs.rm(home, { recursive: true, force: true });
    }
  });
  it('writes only the chosen destination and a CONFIG preference after successful save/read', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'native-dialog-success-'));
    try {
      const chosen = path.join(home, 'user-chosen');
      await fs.mkdir(chosen);
      const filePath = path.join(chosen, 'selected.json');
      const config = path.join(home, 'config');
      const dialogs = {
        showSaveDialog: vi.fn(async () => ({ canceled: false, filePath })),
        showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [filePath] })),
      };
      const files = new NativeFileDialogs(config, dialogs, () => home);
      expect(
        await files.save({ defaultFileName: 'suggested.json', content: '{"saved":true}' }),
      ).toEqual({ canceled: false, filePath });
      expect(await fs.readFile(filePath, 'utf8')).toBe('{"saved":true}');
      expect(await fs.readdir(home)).toEqual(['config', 'user-chosen']);
      expect(await fs.readdir(chosen)).toEqual(['selected.json']);
      expect(
        JSON.parse(await fs.readFile(path.join(config, 'file-dialog-directory.json'), 'utf8')),
      ).toBe(chosen);
      const restarted = new NativeFileDialogs(config, dialogs, () => home);
      expect(await restarted.open()).toEqual({
        canceled: false,
        filePath,
        content: '{"saved":true}',
      });
      expect(dialogs.showOpenDialog).toHaveBeenCalledWith({
        defaultPath: chosen,
        properties: ['openFile'],
        filters: undefined,
      });
      await fs.rm(chosen, { recursive: true });
      dialogs.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' });
      await restarted.save({ defaultFileName: 'again.json', content: '' });
      expect(dialogs.showSaveDialog).toHaveBeenLastCalledWith({
        defaultPath: path.join(home, 'again.json'),
        filters: undefined,
      });
    } finally {
      await fs.rm(home, { recursive: true, force: true });
    }
  });
});
