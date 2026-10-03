/**
 * Logger bootstrap preflight specs (RefArch Phase 6).
 * Logger 初始化 preflight 规格（RefArch 阶段 6）。
 *
 * Proves with a fake provider that feature module-level loggers are only
 * created after `initializeLogger()` runs, and that repeated initialization is
 * idempotent for identical config and fail-fast for conflicting config.
 *
 * 用 fake provider 证明 feature 模块级 logger 只在 `initializeLogger()` 之后
 * 创建，并覆盖相同配置的幂等重复初始化和冲突配置的 fail-fast。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerFactory, createLogger } from '@memoflow/utils/logger';
import { initializeLogger, __resetLoggerBootstrapStateForTests } from './logger.config';

/**
 * Fake logger carrying a `provider` marker so tests can tell provider-backed
 * loggers apart from the default console provider's output. It is structurally
 * compatible with the shared `ILogger` contract.
 *
 * 携带 `provider` 标记的 fake logger，便于测试区分 provider-backed logger
 * 与默认 console provider 的输出。它结构上兼容共享 `ILogger` 契约。
 */
function makeFakeLogger(context: string) {
  return {
    context,
    provider: 'fake',
    debug: vi.fn(),
    info: vi.fn(),
    http: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: (subContext: string) => makeFakeLogger(`${context}:${subContext}`),
    setLevel: vi.fn(),
  };
}

describe('logger bootstrap preflight (RefArch Phase 6)', () => {
  beforeEach(() => {
    __resetLoggerBootstrapStateForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('feature module-level loggers are provider-backed only after initialization', () => {
    // A feature module creating its logger before init would get the default
    // console provider — no provider marker.
    const prematureLogger = createLogger('FeatureBeforeInit');
    expect((prematureLogger as { provider?: string }).provider).toBeUndefined();

    const createdContexts: string[] = [];
    initializeLogger({
      provider: (context) => {
        createdContexts.push(context);
        return makeFakeLogger(context);
      },
    });

    const featureLogger = createLogger('GoalApiModule');
    expect(featureLogger).toMatchObject({ provider: 'fake', context: 'GoalApiModule' });
    expect(createdContexts).toContain('GoalApiModule');
  });

  it('is idempotent for identical repeated initialization', () => {
    const registerSpy = vi.spyOn(LoggerFactory, 'registerProvider');
    const configureSpy = vi.spyOn(LoggerFactory, 'configure');

    initializeLogger({ level: 'info', provider: (context) => makeFakeLogger(context) });
    initializeLogger({ level: 'info', provider: (context) => makeFakeLogger(context) });

    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(configureSpy).toHaveBeenCalledTimes(1);
    expect(configureSpy).toHaveBeenCalledWith({ level: 'info', enableInProduction: true });
  });

  it('fails fast on a conflicting level without replacing the frozen config', () => {
    initializeLogger({ level: 'info', provider: (context) => makeFakeLogger(context) });

    expect(() =>
      initializeLogger({ level: 'warn', provider: (context) => makeFakeLogger(context) }),
    ).toThrow(/conflict|exactly once/i);

    expect(LoggerFactory.getConfig().level).toBe('info');
  });

  it('fails fast on a conflicting enableInProduction flag', () => {
    initializeLogger({
      level: 'info',
      enableInProduction: true,
      provider: (context) => makeFakeLogger(context),
    });

    expect(() =>
      initializeLogger({
        level: 'info',
        enableInProduction: false,
        provider: (context) => makeFakeLogger(context),
      }),
    ).toThrow(/conflict|exactly once/i);
  });
});
