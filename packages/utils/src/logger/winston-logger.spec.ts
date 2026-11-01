/**
 * Focused specs for `WinstonLogger` (RefArch Phase 6).
 * `WinstonLogger` 的聚焦规格（RefArch 阶段 6）。
 *
 * Locks the transport-reuse contract for `child()`, the structured metadata and
 * error shape, and the production JSON console format. These are the behaviours
 * the API logger preflight relies on: one provider-backed logger family per
 * root context, no extra file transports per child.
 *
 * 锁定 `child()` 的 transport 复用契约、结构化 metadata/error 形状，以及生产
 * 环境 JSON console 格式。这些是 API logger preflight 依赖的行为：每个根
 * context 只有一个 provider-backed logger family，child 不新增文件 transport。
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as winston from 'winston';
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { WinstonLogger } from './winston-logger';

/**
 * In-memory winston transport that captures formatted entries for assertions.
 * 用于断言的内存 winston transport，捕获格式化后的日志条目。
 */
class CollectingTransport extends winston.Transport {
  public readonly entries: Array<Record<string, unknown>> = [];

  public log(info: Record<string, unknown>, callback: () => void): void {
    this.entries.push({ ...info });
    callback();
  }
}

/**
 * Spies on the stream the winston Console transport writes to. Under vitest the
 * console object is patched, so winston targets `console._stdout` rather than
 * `process.stdout`; fall back to `process.stdout` when it is unavailable.
 *
 * 拦截 winston Console transport 实际写入的流。vitest 会替换 console 对象，
 * 因此 winston 写入的是 `console._stdout` 而非 `process.stdout`；不可用时回退
 * 到 `process.stdout`。
 */
function spyConsoleWrite(): MockInstance {
  const consoleStdout = (console as { _stdout?: { write: (chunk: unknown) => unknown } })._stdout;
  if (consoleStdout && typeof consoleStdout.write === 'function') {
    return vi.spyOn(consoleStdout, 'write').mockImplementation(() => true);
  }
  return vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
}

/**
 * Builds a test logger whose only transports are the collector plus a silent
 * console, avoiding daily-rotate file side effects.
 *
 * 构建测试 logger：仅包含收集器与静默 console 两个 transports，
 * 避免 daily-rotate 文件副作用。
 */
function createTestLogger(context: string, collecting: CollectingTransport): WinstonLogger {
  return new WinstonLogger(context, {
    level: 'debug',
    transports: [collecting, new winston.transports.Console({ silent: true })],
  });
}

describe('WinstonLogger (RefArch Phase 6)', () => {
  const tempLogDirs: string[] = [];
  const openLoggers: WinstonLogger[] = [];

  /** Per-test LOG_DIR, removed in afterEach. / 每个测试独立 LOG_DIR，afterEach 删除。 */
  function stubTempLogDir(): void {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-logs-'));
    tempLogDirs.push(dir);
    vi.stubEnv('LOG_DIR', dir);
  }

  afterEach(async () => {
    vi.unstubAllEnvs();
    // Flush and close daily-rotate file streams before deleting LOG_DIR, so the
    // async file open cannot race the removal.
    // 删除 LOG_DIR 前先 flush 并关闭 daily-rotate 文件流，避免异步打开与删除竞争。
    for (const logger of openLoggers.splice(0)) {
      await Promise.all(
        logger.getWinstonLogger().transports.map(
          (transport) =>
            new Promise<void>((resolve) => {
              const closable = transport as typeof transport & {
                close?: () => void;
                logStream?: unknown;
              };
              if (!closable.logStream || typeof closable.close !== 'function') {
                resolve();
                return;
              }
              closable.once('finish', () => resolve());
              closable.close();
            }),
        ),
      );
    }
    for (const dir of tempLogDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('child() reuses the parent transport instances instead of creating new daily-rotate transports', () => {
    const collecting = new CollectingTransport();
    const root = createTestLogger('API', collecting);

    const child = root.child('FeatureModule') as WinstonLogger;

    expect(child.context).toBe('API:FeatureModule');
    const parentTransports = [...root.getWinstonLogger().transports];
    const childTransports = [...child.getWinstonLogger().transports];
    expect(childTransports).toHaveLength(parentTransports.length);
    expect(childTransports.every((transport, index) => transport === parentTransports[index])).toBe(
      true,
    );
    expect(collecting.entries).toHaveLength(0);
  });

  it('records structured metadata on info()', () => {
    const collecting = new CollectingTransport();
    const logger = createTestLogger('API', collecting);

    logger.info('request completed', { requestId: 'r-1', durationMs: 10 });

    expect(collecting.entries).toHaveLength(1);
    const entry = collecting.entries[0]!;
    expect(entry.message).toBe('request completed');
    expect(entry.context).toBe('API');
    expect(entry.requestId).toBe('r-1');
    expect(entry.durationMs).toBe(10);
  });

  it('normalizes Error instances to a structured error object', () => {
    const collecting = new CollectingTransport();
    const logger = createTestLogger('API', collecting);

    logger.error('boom', new Error('kaboom'));

    const entry = collecting.entries[0]!;
    expect(entry.error).toMatchObject({ name: 'Error', message: 'kaboom' });
    expect((entry.error as { stack?: string }).stack).toBeTruthy();
  });

  it('keeps non-Error error payloads under the error key', () => {
    const collecting = new CollectingTransport();
    const logger = createTestLogger('API', collecting);

    logger.error('client failed', { code: 'E_1' } as unknown as Error);

    const entry = collecting.entries[0]!;
    expect(entry.error).toEqual({ code: 'E_1' });
  });

  it('child entries inherit the parent structured error shape and context', () => {
    const collecting = new CollectingTransport();
    const root = createTestLogger('API', collecting);

    (root.child('Reminder') as WinstonLogger).error('nested boom', new Error('nested'));

    const entry = collecting.entries[0]!;
    expect(entry.context).toBe('API:Reminder');
    expect(entry.error).toMatchObject({ name: 'Error', message: 'nested' });
  });

  it('normalizes an Error passed as warn() meta under the error key', () => {
    const collecting = new CollectingTransport();
    const logger = createTestLogger('API', collecting);
    const failure = new Error('disk full');

    logger.warn('profile switch failed', { error: failure });

    const entry = collecting.entries[0]!;
    expect(JSON.stringify(entry.error)).not.toBe('{}');
    expect(entry.error).not.toBeInstanceOf(Error);
    expect(entry.error).toMatchObject({ name: 'Error', message: 'disk full' });
    expect((entry.error as { stack?: string }).stack).toBeTruthy();
    expect(entry.message).toBe('profile switch failed');
  });

  it('normalizes an Error nested two levels deep in info() meta', () => {
    const collecting = new CollectingTransport();
    const logger = createTestLogger('API', collecting);
    const failure = new Error('inner cause');

    logger.info('nested meta', { error: { error: failure } });

    const entry = collecting.entries[0]!;
    const inner = (entry.error as { error: Record<string, unknown> }).error;
    expect(JSON.stringify(inner)).not.toBe('{}');
    expect(inner).not.toBeInstanceOf(Error);
    expect(inner).toMatchObject({ name: 'Error', message: 'inner cause' });
    expect(inner.stack).toBeTruthy();
  });

  it('leaves non-Error meta structurally identical to the raw values', () => {
    const collecting = new CollectingTransport();
    const logger = createTestLogger('API', collecting);
    const at = new Date('2026-01-02T03:04:05.000Z');
    const meta = {
      requestId: 'r-2',
      attempt: 0,
      enabled: false,
      missing: null,
      at,
      nested: { list: [1, 'two', { deep: true }] },
    };

    logger.warn('plain meta', meta);

    const entry = collecting.entries[0]!;
    expect(entry.requestId).toBe('r-2');
    expect(entry.attempt).toBe(0);
    expect(entry.enabled).toBe(false);
    expect(entry.missing).toBeNull();
    expect(entry.at).toEqual(at);
    expect(entry).toMatchObject({ nested: { list: [1, 'two', { deep: true }] } });
    expect(entry.message).toBe('plain meta');
  });

  it('keeps the dedicated error(message, error) shape unchanged', () => {
    const collecting = new CollectingTransport();
    const logger = createTestLogger('API', collecting);

    logger.error('boom', new Error('kaboom'));

    const entry = collecting.entries[0]!;
    expect(Object.keys(entry.error as object)).toEqual(['message', 'stack', 'name']);
    expect(entry.error).toMatchObject({ name: 'Error', message: 'kaboom' });
  });

  it('does not throw when meta contains a circular reference', () => {
    const collecting = new CollectingTransport();
    const logger = createTestLogger('API', collecting);
    const cyclic: Record<string, unknown> = { stage: 'compose' };
    cyclic.self = cyclic;

    expect(() => logger.warn('cyclic meta', cyclic)).not.toThrow();
    expect(collecting.entries[0]!.message).toBe('cyclic meta');
  });

  it('serializes a warn meta Error as JSON on the production console', () => {
    vi.stubEnv('NODE_ENV', 'production');
    stubTempLogDir();

    const writeSpy = spyConsoleWrite();
    try {
      const root = new WinstonLogger('API', { level: 'info' });
      openLoggers.push(root);
      root.warn('json console warn', { profileId: 'guest-1', error: new Error('destroyed') });

      const output = writeSpy.mock.calls.map((call) => String(call[0])).join('');
      const parsedLines = output
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
      const entry = parsedLines.find((line) => line.message === 'json console warn');

      expect(entry?.profileId).toBe('guest-1');
      expect(entry?.error).toMatchObject({ name: 'Error', message: 'destroyed' });
      expect((entry?.error as { stack?: string }).stack).toBeTruthy();
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('root context logs are machine-parseable JSON on the console in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    stubTempLogDir();

    const writeSpy = spyConsoleWrite();
    try {
      const root = new WinstonLogger('API', { level: 'info' });
      openLoggers.push(root);
      root.info('json console', { route: '/healthz', statusCode: 200 });

      const output = writeSpy.mock.calls.map((call) => String(call[0])).join('');
      const parsedLines = output
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));

      expect(
        parsedLines.some(
          (entry) =>
            entry.message === 'json console' &&
            entry.route === '/healthz' &&
            entry.statusCode === 200 &&
            entry.context === 'API',
        ),
      ).toBe(true);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('keeps the pretty console format outside production (no JSON requirement)', () => {
    vi.stubEnv('NODE_ENV', 'development');
    stubTempLogDir();

    const writeSpy = spyConsoleWrite();
    try {
      const root = new WinstonLogger('API', { level: 'info' });
      openLoggers.push(root);
      root.info('pretty console');

      const output = writeSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('pretty console');
    } finally {
      writeSpy.mockRestore();
    }
  });
});
