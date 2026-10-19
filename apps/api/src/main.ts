/**
 * API Preflight Entry
 * API Preflight 入口
 *
 * RefArch Phase 6: this file is deliberately the ONLY place the logger provider
 * is initialized. It loads the validated env singleton, calls the idempotent
 * `initializeLogger()` synchronously, and only then dynamically imports the
 * server graph — so no module-level `createLogger()` can ever run against the
 * default console provider.
 *
 * RefArch 阶段 6：本文件刻意是唯一初始化 logger provider 的位置。它先加载
 * 已验证的 env 单例，同步调用幂等 `initializeLogger()`，然后才动态导入 server
 * 依赖图——因此任何模块级 `createLogger()` 都不会在默认 console provider 上运行。
 *
 * The tsup build keeps `dist/main.js` as the runtime entry; the dynamic import
 * below resolves to the separately emitted `dist/server.js`.
 *
 * tsup 构建保持 `dist/main.js` 为运行时入口；下方的动态 import 解析到单独产物
 * `dist/server.js`。
 */

// Validated env (frozen singleton) evaluates at import time. The env schema's
// fatal validation error via console.error is the only preflight console output.
import { env } from './shared/infrastructure/config/env.js';
import { initializeLogger } from './shared/infrastructure/config/logger.config';
import { initializeTraceRuntime } from './shared/infrastructure/observability/trace-runtime';

// Explicitly touch the env singleton so the preflight contract (validated env
// before provider) is visible to readers and to the bundler.
void env;

// A closed stdio pipe (detached e2e runner, crashed parent terminal) must not
// become an uncaughtException loop that takes the server down: each log write
// EPIPEs, the shutdown handler logs again, and the loop degrades or kills a
// still-serving process (#505). EPIPE on stdout/stderr only means the console
// sink is gone; file transports keep logging, so the server keeps serving.
for (const stream of [process.stdout, process.stderr]) {
  stream?.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') return;
    throw error;
  });
}

// Register the single provider/configuration BEFORE the feature graph loads.
initializeLogger();

/**
 * Starts the API server by dynamically importing the server runtime.
 * 通过动态导入 server runtime 启动 API 服务器。
 *
 * The dynamic import delays evaluation of the entire feature graph (module-level
 * `createLogger()` calls included) until after `initializeLogger()` completes.
 * The trace runtime is initialized here too (noop by default) so the SDK is
 * registered before any span could be created.
 *
 * 动态 import 会推迟整个 feature 依赖图的求值（包括模块级 `createLogger()`
 * 调用），直到 `initializeLogger()` 完成后。trace runtime 也在此初始化
 * （默认 noop），确保 SDK 在任何 span 创建前已注册。
 *
 * @returns A promise that settles when the server has bootstrapped.
 */
async function start(): Promise<void> {
  const traceRuntime = await initializeTraceRuntime();
  const { runServer } = await import('./server.js');
  await runServer(traceRuntime);
}

start().catch((error) => {
  // Preflight failure outside the server graph (unlikely once the env schema
  // and logger provider are up) still exits non-zero for the supervisor.
  // Preflight 在 server 依赖图之外的失败（env schema 与 logger provider 就绪后
  // 不太可能发生）仍以非零码退出，交由 supervisor 处理。
  console.error('[preflight] API server failed to start', error);
  process.exit(1);
});
