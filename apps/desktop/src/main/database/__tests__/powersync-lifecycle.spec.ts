import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ create: vi.fn() }));
const safeLogs = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock('@memoflow/utils/logger', () => ({
  createLogger: () => safeLogs,
}));
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
    get: vi.fn(async () => ({ count: 0 })),
    getOptional: vi.fn(
      async (): Promise<{ name: string; last_op: number; last_applied_op: number } | null> => null,
    ),
    execute: vi.fn(),
  };
  return {
    transaction,
    waitForReady: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    connect: vi.fn(async () => undefined),
    currentStatus: { connected: false, connecting: false, hasSynced: false },
    unsubscribe: vi.fn(),
    disposeStatus: vi.fn(),
    registerListener: vi.fn(
      (_listener: { statusChanged: (status: unknown) => void }) => () => undefined,
    ),
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
    safeLogs.info.mockReset();
    safeLogs.warn.mockReset();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'powersync-lifecycle-test-'));
    db = database();
    db.onChange.mockReturnValue(db.unsubscribe);
    db.registerListener.mockReturnValue(db.disposeStatus);
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
    const sdkOptions = sdk.create.mock.calls[0]?.[0] as {
      remoteOptions?: { customFetch?: typeof fetch };
    };
    expect(typeof sdkOptions.remoteOptions?.customFetch).toBe('function');

    await api.shutdownPowerSync();

    expect(db.close).toHaveBeenCalledOnce();
    expect(db.unsubscribe).toHaveBeenCalledOnce();
    expect(db.disposeStatus).toHaveBeenCalledOnce();
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

  it('records SDK initial download error safely when connect resolves without a checkpoint', async () => {
    await api.openPowerSyncLocalOnly(path.join(root, 'a.db'));
    const onStatusChanged = db.registerListener.mock.calls[0]?.[0]?.statusChanged;
    expect(typeof onStatusChanged).toBe('function');
    const error = Object.assign(new Error('Bearer should-not-leak'), {
      name: 'FetchError',
      status: 503,
    });
    db.connect.mockImplementationOnce(async () => {
      onStatusChanged({
        connected: false,
        connecting: true,
        hasSynced: false,
        dataFlowStatus: { downloadError: error },
      });
    });
    await api.ensurePowerSyncSyncMode({ getAccessToken: async () => 'test-token' });
    expect(safeLogs.warn).toHaveBeenCalledWith(
      'PowerSync download failed; SDK may retry',
      expect.objectContaining({ phase: 'download_error', httpStatus: 503, hasSynced: false }),
    );
    expect(JSON.stringify(safeLogs.warn.mock.calls)).not.toContain('should-not-leak');
    expect(db.connect).toHaveBeenCalledOnce();
    // The SDK remains attached to its own retry loop; do not delete local CRUD.
    expect(db.transaction.execute).not.toHaveBeenCalled();
    await api.shutdownPowerSync();
    expect(db.disposeStatus).toHaveBeenCalledOnce();
  });

  it('reports first-download completion only after SDK status confirms hasSynced', async () => {
    await api.openPowerSyncLocalOnly(path.join(root, 'a.db'));
    const onStatusChanged = db.registerListener.mock.calls[0]?.[0]?.statusChanged;
    expect(typeof onStatusChanged).toBe('function');
    onStatusChanged({
      connected: true,
      connecting: false,
      hasSynced: false,
    });
    expect(safeLogs.info).toHaveBeenCalledWith(
      'PowerSync download state changed',
      expect.objectContaining({ phase: 'connected', hasSynced: false }),
    );
    onStatusChanged({
      connected: true,
      connecting: false,
      hasSynced: true,
    });
    expect(safeLogs.info).toHaveBeenCalledWith(
      'PowerSync download state changed',
      expect.objectContaining({ phase: 'synced', hasSynced: true }),
    );
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

  it.each([false, true])(
    'preserves preference CRUD regardless of pre-hydration bucket presence (%s)',
    async (hasBucket) => {
      db.transaction.getOptional.mockResolvedValue(
        hasBucket ? { name: '1#user_data[owner]', last_op: 1, last_applied_op: 0 } : null,
      );
      await api.openPowerSyncLocalOnly(path.join(root, 'a.db'));
      await api.ensurePowerSyncSyncMode({ getAccessToken: async () => 'test-token' });
      // No bucket heuristic can prove whether a preference write was automatic or
      // a real offline edit. Neither absent nor pending buckets authorize deletion.
      expect(db.transaction.getOptional).not.toHaveBeenCalled();
      expect(JSON.stringify(db.transaction.get.mock.calls)).not.toContain(
        'user_preference_records',
      );
      expect(db.transaction.execute).not.toHaveBeenCalled();
    },
  );

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
