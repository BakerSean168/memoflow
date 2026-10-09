import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@powersync/node', () => ({
  PowerSyncDatabase: class {
    constructor(options: unknown) {
      return sdk.create(options);
    }
  },
}));
vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock('../../utils/api-config', () => ({
  getApiBaseUrl: () => 'http://127.0.0.1:1',
}));

function database() {
  const transaction = {
    get: async () => ({ count: 0 }),
    getOptional: async () => null,
    execute: vi.fn(),
  };
  return {
    waitForReady: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    connect: vi.fn(async () => undefined),
    unsubscribe: vi.fn(),
    onChange: vi.fn(),
    writeTransaction: vi.fn(async (work: (tx: typeof transaction) => Promise<void>) =>
      work(transaction),
    ),
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('PowerSync Profile database lifecycle', () => {
  let root: string;
  let db: ReturnType<typeof database>;
  let api: typeof import('../powersync');

  beforeEach(async () => {
    vi.resetModules();
    sdk.create.mockReset();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'powersync-lifecycle-test-'));
    db = database();
    db.onChange.mockReturnValue(db.unsubscribe);
    sdk.create.mockReturnValue(db);
    api = await import('../powersync');
  });

  afterEach(async () => {
    db.close.mockResolvedValue(undefined);
    await api.shutdownPowerSync();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('closes the local database and its subscription when its Profile is destroyed', async () => {
    const opened = await api.openPowerSyncLocalOnly(path.join(root, 'profile.db'));
    expect(api.getPowerSyncDatabase()).toBe(opened);

    await api.shutdownPowerSync();

    expect(db.close).toHaveBeenCalledOnce();
    expect(db.unsubscribe).toHaveBeenCalledOnce();
    expect(api.getPowerSyncDatabase()).toBeNull();
    await api.shutdownPowerSync();
    expect(db.close).toHaveBeenCalledOnce();
  });

  it('retires an opening database without publishing it after shutdown', async () => {
    const ready = deferred();
    db.waitForReady.mockReturnValue(ready.promise);
    const opening = api.openPowerSyncLocalOnly(path.join(root, 'profile.db'));
    const outcome = opening.then(
      () => 'published',
      () => 'cancelled',
    );

    const closing = api.shutdownPowerSync();
    ready.resolve();
    await closing;

    expect(await outcome).toBe('cancelled');
    expect(db.close).toHaveBeenCalledOnce();
    expect(db.onChange).not.toHaveBeenCalled();
    expect(api.getPowerSyncDatabase()).toBeNull();
  });

  it('does not reuse an in-flight open for a different Profile path', async () => {
    const ready = deferred();
    db.waitForReady.mockReturnValue(ready.promise);
    const first = api.openPowerSyncLocalOnly(path.join(root, 'a.db'));
    const second = api.openPowerSyncLocalOnly(path.join(root, 'b.db'));
    const secondOutcome = second.then(
      () => null,
      (error: Error) => error.message,
    );
    ready.resolve();

    await first;
    expect(await secondOutcome).toMatch(/another profile/i);
    expect(sdk.create).toHaveBeenCalledOnce();
  });

  it('shares one opening instance for equivalent normalized paths', async () => {
    const ready = deferred();
    db.waitForReady.mockReturnValue(ready.promise);
    const first = api.openPowerSyncLocalOnly(path.join(root, 'profile.db'));
    const second = api.openPowerSyncLocalOnly(root + '/unused/../profile.db');
    ready.resolve();

    expect(await second).toBe(await first);
    expect(sdk.create).toHaveBeenCalledOnce();
    expect(db.onChange).toHaveBeenCalledOnce();
  });

  it('closes a failed initialization before another Profile can open', async () => {
    db.waitForReady.mockRejectedValueOnce(new Error('initialization failed'));
    await expect(api.openPowerSyncLocalOnly(path.join(root, 'a.db'))).rejects.toThrow(
      'initialization failed',
    );

    expect(db.close).toHaveBeenCalledOnce();
    expect(api.getPowerSyncDatabase()).toBeNull();
    await api.openPowerSyncLocalOnly(path.join(root, 'b.db'));
    expect(sdk.create).toHaveBeenCalledTimes(2);
  });

  it('retains a failed close for retry and blocks replacement instead of hiding the failure', async () => {
    await api.openPowerSyncLocalOnly(path.join(root, 'a.db'));
    db.close.mockRejectedValueOnce(new Error('database busy'));

    await expect(api.shutdownPowerSync()).rejects.toThrow('database busy');
    expect(api.getPowerSyncDatabase()).toBeNull();
    await expect(api.openPowerSyncLocalOnly(path.join(root, 'b.db'))).rejects.toThrow(
      /close failed/,
    );
    expect(sdk.create).toHaveBeenCalledOnce();

    await api.shutdownPowerSync();
    expect(db.close).toHaveBeenCalledTimes(2);
    await api.openPowerSyncLocalOnly(path.join(root, 'b.db'));
    expect(sdk.create).toHaveBeenCalledTimes(2);
  });

  it('waits for a closing Profile before creating a new database', async () => {
    await api.openPowerSyncLocalOnly(path.join(root, 'a.db'));
    const closeStarted = deferred();
    const closed = deferred();
    db.close.mockImplementationOnce(async () => {
      closeStarted.resolve();
      await closed.promise;
    });
    const closing = api.shutdownPowerSync();
    await closeStarted.promise;
    const next = api.openPowerSyncLocalOnly(path.join(root, 'b.db'));
    expect(sdk.create).toHaveBeenCalledOnce();

    closed.resolve();
    await closing;
    await next;
    expect(sdk.create).toHaveBeenCalledTimes(2);
  });

  it('serializes sync promotion and keeps the local database open on disconnect', async () => {
    const opened = await api.openPowerSyncLocalOnly(path.join(root, 'a.db'));
    const credentials = { getAccessToken: async () => 'test-token' };
    await Promise.all([
      api.ensurePowerSyncSyncMode(credentials),
      api.ensurePowerSyncSyncMode(credentials),
    ]);
    expect(db.connect).toHaveBeenCalledOnce();

    await api.disablePowerSyncSyncMode();
    expect(db.disconnect).toHaveBeenCalledOnce();
    expect(db.close).not.toHaveBeenCalled();
    expect(api.getPowerSyncDatabase()).toBe(opened);
  });

  it('waits for an in-flight sync promotion without publishing it after shutdown', async () => {
    await api.openPowerSyncLocalOnly(path.join(root, 'a.db'));
    const connecting = deferred();
    const connected = deferred();
    db.connect.mockImplementationOnce(async () => {
      connecting.resolve();
      await connected.promise;
    });
    const promoted = api.ensurePowerSyncSyncMode({ getAccessToken: async () => 'test-token' });
    const outcome = promoted.then(
      () => 'published',
      () => 'cancelled',
    );
    await connecting.promise;
    const closing = api.shutdownPowerSync();
    expect(api.getPowerSyncDatabase()).toBeNull();
    expect(db.close).not.toHaveBeenCalled();

    connected.resolve();
    await closing;
    expect(await outcome).toBe('cancelled');
    expect(db.close).toHaveBeenCalledOnce();
    expect(api.getPowerSyncDatabase()).toBeNull();
  });

  it('disconnects a pending SDK connection before waiting for shutdown to drain it', async () => {
    await api.openPowerSyncLocalOnly(path.join(root, 'a.db'));
    const connecting = deferred();
    const disconnected = deferred();
    db.connect.mockImplementationOnce(async () => {
      connecting.resolve();
      await disconnected.promise;
    });
    db.disconnect.mockImplementation(async () => {
      disconnected.resolve();
    });
    const promoted = api
      .ensurePowerSyncSyncMode({ getAccessToken: async () => 'test-token' })
      .catch(() => undefined);
    await connecting.promise;
    const closing = api.shutdownPowerSync();
    try {
      await vi.waitFor(() => expect(db.disconnect).toHaveBeenCalled(), { timeout: 300 });
    } finally {
      disconnected.resolve();
      await Promise.all([promoted, closing]);
    }
    expect(db.close).toHaveBeenCalledOnce();
  });

  it('cancels a pending promotion when disabling sync but keeps the local database usable', async () => {
    const opened = await api.openPowerSyncLocalOnly(path.join(root, 'a.db'));
    const connecting = deferred();
    const disconnected = deferred();
    db.connect.mockImplementationOnce(async () => {
      connecting.resolve();
      await disconnected.promise;
    });
    db.disconnect.mockImplementation(async () => {
      disconnected.resolve();
    });
    const promoted = api
      .ensurePowerSyncSyncMode({ getAccessToken: async () => 'test-token' })
      .catch(() => undefined);
    await connecting.promise;
    const disabling = api.disablePowerSyncSyncMode();
    try {
      await vi.waitFor(() => expect(db.disconnect).toHaveBeenCalled(), { timeout: 300 });
    } finally {
      disconnected.resolve();
      await Promise.all([promoted, disabling]);
    }
    expect(api.getPowerSyncDatabase()).toBe(opened);
    expect(db.close).not.toHaveBeenCalled();
  });
});
