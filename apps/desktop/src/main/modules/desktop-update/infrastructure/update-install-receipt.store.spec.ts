import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileDesktopUpdateInstallReceiptStore } from './update-install-receipt.store';

describe('FileDesktopUpdateInstallReceiptStore', () => {
  let rootDir: string;
  let store: FileDesktopUpdateInstallReceiptStore;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memoflow-update-receipt-'));
    store = new FileDesktopUpdateInstallReceiptStore(rootDir);
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('stores update state outside every Profile directory', () => {
    expect(store.receiptPath).toBe(path.join(rootDir, 'shared', 'update', 'install-receipt.json'));
    expect(store.receiptPath).not.toContain(path.sep + 'profiles' + path.sep);
  });

  it('atomically writes, reads, replaces, and clears the receipt', async () => {
    await store.write({
      previousVersion: '1.2.2',
      expectedVersion: '1.2.3',
      requestedAt: '2026-09-30T08:30:00.000Z',
      stage: 'restart-requested',
    });

    await expect(store.read()).resolves.toEqual({
      previousVersion: '1.2.2',
      expectedVersion: '1.2.3',
      requestedAt: '2026-09-30T08:30:00.000Z',
      stage: 'restart-requested',
    });

    await store.write({
      previousVersion: '1.2.2',
      expectedVersion: '1.2.3',
      requestedAt: '2026-09-30T08:30:00.000Z',
      stage: 'installer-handoff',
    });

    await expect(store.read()).resolves.toMatchObject({
      stage: 'installer-handoff',
    });

    const directoryEntries = await fs.readdir(store.directory);
    expect(directoryEntries).toEqual(['install-receipt.json']);

    await store.clear();
    await expect(store.read()).resolves.toBeNull();
  });

  it('leaves corrupt receipt storage untouched for read-only diagnostics', async () => {
    await fs.mkdir(store.directory, { recursive: true });
    await fs.writeFile(store.receiptPath, '{not-json', 'utf8');
    await expect(store.read({ repairCorruption: false })).rejects.toThrow(
      'Invalid Desktop update install receipt',
    );
    expect(await fs.readFile(store.receiptPath, 'utf8')).toBe('{not-json');
  });

  it('ignores and removes corrupted JSON without blocking startup', async () => {
    await fs.mkdir(store.directory, { recursive: true });
    await fs.writeFile(store.receiptPath, '{not-json', 'utf8');

    await expect(store.read()).resolves.toBeNull();
    await expect(fs.stat(store.receiptPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('ignores and removes receipts with unexpected fields or invalid stages', async () => {
    await fs.mkdir(store.directory, { recursive: true });
    await fs.writeFile(
      store.receiptPath,
      JSON.stringify({
        previousVersion: '1.2.2',
        expectedVersion: '1.2.3',
        requestedAt: '2026-09-30T08:30:00.000Z',
        stage: 'made-up-stage',
        privatePath: '/private/cache',
      }),
      'utf8',
    );

    await expect(store.read()).resolves.toBeNull();
    await expect(fs.stat(store.receiptPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
