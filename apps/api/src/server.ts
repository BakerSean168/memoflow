/**
 * API Server Runtime
 * API 服务运行时
 *
 * 使用 ApiBootstrapper 的白名单注册机制启动服务，
 * 每个模块实现 IApiModule 接口。
 *
 * 模块注册策略：
 * - 每个模块实现 IApiModule 接口
 * - 宿主（本文件 runtime 层）负责 feature 装配：治理的 adapter/application
 *   组装由 apps/api/src/runtime/compose-governance.ts 完成（选择 Prisma repository
 *   → event-log runtime → createGovernanceModule），模块只注册 transport 与生命周期
 * - 故障模块：注释掉即可，不影响其他模块启动
 *
 * RefArch Phase 6: this module is imported dynamically from the preflight entry
 * (`main.ts`) AFTER the logger provider is initialized, so every module-level
 * `createLogger()` in this graph is provider-backed. `initializeLogger()` must
 * not be called again here.
 *
 * RefArch 阶段 6：本模块由 preflight 入口（`main.ts`）在 logger provider 初始化
 * 之后动态导入，因此本依赖图中所有模块级 `createLogger()` 都是 provider-backed。
 * 此处不得再次调用 `initializeLogger()`。
 */

// 环境配置必须最先加载（包含 dotenv 加载逻辑）
import {
  env,
  getJwtConfig,
  getGithubOAuthConfig,
  getGithubAppConfig,
} from './shared/infrastructure/config/env.js';
import { getTrustedWebOrigins } from './shared/infrastructure/config/web-origin.js';
import { prisma, connectDatabase, disconnectDatabase } from '@memoflow/database';
import { getStartupInfo } from './shared/infrastructure/config/logger.config';
import { createLogger } from '@memoflow/utils/logger';
import { createRuntimeOwnership } from '@memoflow/contracts/primitives';
import { ApiBootstrapper } from './bootstrap';
import type { TraceRuntime } from './shared/infrastructure/observability/trace-runtime';
import { ensurePowerSyncPublication } from './shared/infrastructure/database/ensure-powersync-publication.js';

// === 模块导入 ===
// 新模块（来自独立包，完全自治）
import { composeGovernance } from './runtime/compose-governance';
import { composeAccount } from './runtime/compose-account';
import { composeNotification } from './runtime/compose-notification';
import { composeReminder, createExecutorClosureChecker } from './runtime/compose-reminder';
import { composeRepository } from './runtime/compose-repository';
import { composeSchedule } from './runtime/compose-schedule';
import { composeSetting } from './runtime/compose-setting';
import { composeDataPortability } from './runtime/compose-data-portability';
import { composeAI } from './runtime/compose-ai';
import {
  AccountClosedWorker,
  PrismaAccountClosureOperationRepository,
  createCloudAccountProvisioner,
} from '@memoflow/account';
import { ReminderAccountClosedConsumer } from '@memoflow/reminder/server';
import { NotificationAccountClosedConsumer } from '@memoflow/notification/server';
import { RepositoryAccountClosedConsumer } from '@memoflow/repository/server';
import {
  createCloudAuth,
  createCloudAuthEmailDelivery,
  createCloudAuthEmailLinkCapture,
} from '@memoflow/cloud-auth/server';
import { composeGoal } from './runtime/compose-goal';
import { PrismaTaskBindingReadPort } from '@memoflow/task';
import { createGoalTaskProgressPrismaHandler } from '@memoflow/goal';
import { createGoalPrismaReminderFireHandler } from '@memoflow/goal/schedule-execution';
import { createGoalPrismaScheduleProjectionSource } from '@memoflow/goal/schedule-projection';
import { resolveRepositoryStorageBaseDir } from '@memoflow/repository';
import { createSchedulePrismaRepositories } from '@memoflow/schedule';
import { createSchedulerPrismaRepositories } from '@memoflow/scheduler';
import { createScheduleOrchestrationModule } from '@memoflow/schedule-orchestration';
import { createTaskReminderScheduledHandlerRegistration } from '@memoflow/task/schedule-execution';
import { createTaskPrismaScheduleProjectionSource } from '@memoflow/task/schedule-projection';
import { createRoutinePrismaScheduleExecutionDeps } from '@memoflow/reminder/schedule-execution';
import { createRoutinePrismaScheduleProjectionSource } from '@memoflow/reminder/schedule-projection';
import { composeTask } from './runtime/compose-task';
// 基础设施模块（直接在 API 内部定义）
import { composePowerSyncApiModule } from './modules/powersync/module.js';
import { composeDashboardApiModule } from './modules/dashboard/module.js';
import { composeLabelApiModule } from './modules/label/module.js';
import { LabelService, PrismaLabelRepository } from '@memoflow/label';
import { createSystemClock } from '@memoflow/time';
import { PrismaDashboardReadPort } from './modules/dashboard/dashboard-read-port.js';
import {
  PrismaActivityLedgerWriter,
  createActivityLedgerRecorder,
} from './modules/dashboard/activity-ledger.js';
import { RepositoryKnowledgeCloudDataPurgerAdapter } from './modules/ai/repository-knowledge-cloud-data-purger.adapter';
import { createCronScheduler } from './shared/infrastructure/cron/index.js';
import type { CronSchedulerManager } from './shared/infrastructure/cron/index.js';
import { PrismaOutboxWriter } from './outbox/prisma-outbox-writer';

const logger = createLogger('API');

let bootstrapper: ApiBootstrapper | null = null;
let scheduler: CronSchedulerManager | null = null;
let traceRuntime: TraceRuntime | null = null;
const repositoryStorageBaseDir = resolveRepositoryStorageBaseDir();

async function bootstrap(): Promise<void> {
  // R0-1：runtime ownership —— 明确"哪个宿主在运行、当前进程是谁"，
  // 为双宿主对账与 R3 的 scheduler 单宿主租约打底。
  const ownership = createRuntimeOwnership('cloud-api', undefined, () => new Date());
  logger.info('[runtime-ownership] API host ownership', {
    ...ownership,
    nodeEnv: env.NODE_ENV,
    port: env.API_PORT,
  });

  logger.info('Starting MemoFlow API server...', {
    ...getStartupInfo(),
    port: env.API_PORT,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
  });

  // 1. 数据库连接
  let databaseConnected = false;
  try {
    await connectDatabase();
    databaseConnected = true;
    logger.info('Database connected successfully');
  } catch (dbError) {
    logger.warn('Database connection failed, starting in limited mode', dbError);
  }

  if (databaseConnected) {
    logger.info('Ensuring PowerSync publication exists');
    await ensurePowerSyncPublication();
  }

  const jwtConfig = getJwtConfig();
  const githubOAuthConfig = getGithubOAuthConfig();
  const baseEmailDelivery = createCloudAuthEmailDelivery();
  const testEmailLinks = env.LOCAL_VALIDATION
    ? createCloudAuthEmailLinkCapture(baseEmailDelivery)
    : undefined;
  const closureRepo = new PrismaAccountClosureOperationRepository(prisma);
  const accountActiveChecker = async (identityId: string) =>
    (await closureRepo.findActiveByIdentityId(identityId)) !== null;
  // Executor-visible closure predicate frozen from merge-base: block when the
  // account is missing / Closed, or an active closure operation
  // exists in requested|revoking|closing. The AI executor MUST see this
  // predicate, not the shared account-active checker.
  // 从 merge-base 冻结的 executor 可见闭户谓词：账户缺失 / Closed
  // 或存在 requested|revoking|closing 阶段的有效闭户操作时阻断。AI executor
  // 必须看到该谓词，而不是共享的账户激活检查器。
  const executorClosureChecker = createExecutorClosureChecker(prisma);
  const cloudAuth = createCloudAuth({
    database: prisma,
    secret: jwtConfig.secret,
    baseUrl:
      env.AUTH_BASE_URL ??
      `http://${env.API_HOST === '0.0.0.0' ? 'localhost' : env.API_HOST}:${env.API_PORT}/api/auth`,
    deviceVerificationUrl: new URL(
      '/auth/device',
      env.MEMOFLOW_WEB_URL ?? 'http://localhost:5173',
    ).toString(),
    trustedOrigins: getTrustedWebOrigins(
      env.CORS_ORIGIN.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      env.MEMOFLOW_WEB_URL,
    ),
    github: githubOAuthConfig ?? undefined,
    userProvisioner: createCloudAccountProvisioner(prisma, createSystemClock()),
    emailDelivery: testEmailLinks?.delivery ?? baseEmailDelivery,
    closureChecker: accountActiveChecker,
    rateLimit: env.LOCAL_VALIDATION
      ? {
          enabled: true,
          customRules: {
            // Better Auth's glob treats `*` as one path segment; `/**` is
            // required to override nested endpoints such as `/sign-in/email`.
            '/**': { window: 10, max: 100 },
          },
        }
      : undefined,
  });

  // 2. 白名单注册 & 启动
  bootstrapper = new ApiBootstrapper(prisma, cloudAuth, testEmailLinks, traceRuntime?.trace, {
    github: Boolean(githubOAuthConfig),
  });

  // Step C：宿主 runtime 负责 feature 装配。所有 remaining 模块（account /
  // notification / reminder / repository / schedule / setting / data-portability）
  // 都通过 runtime composer 组装成已绑定实例的 module handle，再按原注册顺序注册。
  const accountApiModule = composeAccount({
    db: prisma,
    cloudAuth,
    clock: createSystemClock(),
  });
  const settingApiModule = composeSetting({ db: prisma });
  const notificationApiModule = composeNotification({
    db: prisma,
    closureChecker: accountActiveChecker,
    userTimeContextPort: settingApiModule.userTimeContextPort,
    channelCapabilities: [
      {
        channelType: 'InApp',
        status: 'available',
        requiredInProduction: true,
      },
    ],
  });
  const reminderComposed = composeReminder({
    db: prisma,
    notificationRequestedWriter: notificationApiModule.requestedWriter,
    userTimeContextPort: settingApiModule.userTimeContextPort,
    closureChecker: accountActiveChecker,
    executorClosureChecker,
  });
  const repositoryApiModule = composeRepository({
    db: prisma,
    storageBaseDir: repositoryStorageBaseDir,
    closureChecker: accountActiveChecker,
    githubApp: getGithubAppConfig() ?? undefined,
    knowledgeRepositoryCloudDataPurger: new RepositoryKnowledgeCloudDataPurgerAdapter(prisma),
  });
  const dataPortabilityApiModule = composeDataPortability({ db: prisma });

  // CLEAN-6304: Calendar and Temporal Engine own separate repository sets.
  // Orchestration shares the ONE Scheduler task repository; Calendar receives
  // the Scheduler lease coordinator only through the shared lease port.
  const calendarRepositorySet = createSchedulePrismaRepositories(prisma);
  const schedulerRepositorySet = createSchedulerPrismaRepositories(prisma, {
    outboxWriter: new PrismaOutboxWriter(prisma),
  });
  const routineExecutionDeps = createRoutinePrismaScheduleExecutionDeps(prisma);
  const scheduleOrchestrationModule = createScheduleOrchestrationModule({
    taskProjection: {
      source: createTaskPrismaScheduleProjectionSource(
        prisma,
        settingApiModule.userTimeContextPort,
      ),
      scheduleTaskRepository: schedulerRepositorySet.scheduleTaskRepository,
    },
    goalProjection: {
      source: createGoalPrismaScheduleProjectionSource(
        prisma,
        settingApiModule.userTimeContextPort,
      ),
    },
    reminderProjection: {
      source: reminderComposed.scheduleProjectionSource,
    },
    routineProjection: {
      source: createRoutinePrismaScheduleProjectionSource(prisma),
    },
    routineOverrideStore: routineExecutionDeps.temporaryOverrideStore,
    execution: {
      reminderSource: reminderComposed.scheduleExecutionSource,
      routineSource: routineExecutionDeps,
    },
  });
  scheduleOrchestrationModule.handlerRegistry.register(
    createGoalPrismaReminderFireHandler(prisma, notificationApiModule.requestedWriter),
  );
  const scheduleApiModule = composeSchedule({
    calendarRepositories: calendarRepositorySet,
    schedulerRepositories: schedulerRepositorySet,
    sourceExecutor: scheduleOrchestrationModule.sourceExecutor,
  });
  const taskComposed = composeTask({
    db: prisma,
    runtimeContributions: scheduleOrchestrationModule.projectionRuntime,
    goalProgressHandler: createGoalTaskProgressPrismaHandler(prisma),
    userTimeContextPort: settingApiModule.userTimeContextPort,
  });
  // Register the Task reminder fire handler so scheduled `task.reminder` work
  // (e.g. a one-time task + relative reminder) is executed by the registry-based
  // source executor instead of the legacy router fallback.
  scheduleOrchestrationModule.handlerRegistry.register(
    createTaskReminderScheduledHandlerRegistration({
      taskOccurrenceRepository: taskComposed.taskOccurrenceRepository,
      taskPlanRepository: taskComposed.taskPlanRepository,
      notificationRequestedWriter: notificationApiModule.repositories.requestedWriter,
    }),
  );
  const goalComposed = composeGoal({
    db: prisma,
    taskBindingReadPort: new PrismaTaskBindingReadPort(prisma),
    userTimeContextPort: settingApiModule.userTimeContextPort,
  });
  if (!env.DATABASE_URL) {
    throw new Error('AI Mastra runtime requires DATABASE_URL after environment normalization');
  }
  const labelService = new LabelService(new PrismaLabelRepository(prisma), {
    clock: createSystemClock(),
  });
  const aiApiModule = composeAI({
    db: prisma,
    repositoryApiPort: repositoryApiModule.getApplicationPort(),
    repositoryStorageBaseDir,
    goalApplicationPort: goalComposed.applicationPort,
    taskApplicationPort: taskComposed.applicationPort,
    reminderApplicationPort: reminderComposed.executorReminderPort,
    routineCommandPort: reminderComposed.routineCommandPort,
    scheduleRepository: scheduleApiModule.repositories.scheduleRepository,
    notificationRepository: notificationApiModule.repositories.notificationRepository,
    userTimeContextPort: settingApiModule.userTimeContextPort,
    labelService,
    mastraStorage: { kind: 'postgres', connectionString: env.DATABASE_URL },
  });
  const governanceApiModule = composeGovernance({ db: prisma });
  // App-local infrastructure modules: DB-backed dependencies are bound by the
  // runtime composer/factory closure BEFORE registration; register() only
  // mounts routes against the transport-only context.
  const powerSyncApiModule = composePowerSyncApiModule({ db: prisma });
  const labelApiModule = composeLabelApiModule({ service: labelService });
  const dashboardApiModule = composeDashboardApiModule({
    dashboardReadPort: new PrismaDashboardReadPort(prisma, settingApiModule.userTimeContextPort),
    activityLedgerRuntime: createActivityLedgerRecorder(new PrismaActivityLedgerWriter(prisma)),
  });
  const app = await bootstrapper
    // === 核心：白名单注册 ===
    .register(governanceApiModule) // ✅ 治理模块 (runtime composer)
    .register(accountApiModule) // ✅ 账户模块 (runtime composer)
    .register(notificationApiModule.module) // ✅ 通知模块 (runtime composer)
    .register(reminderComposed.module) // ✅ 提醒模块 (runtime composer)
    .register(repositoryApiModule) // ✅ 仓库模块 (runtime composer)
    .register(scheduleApiModule.calendarModule) // ✅ Calendar/Planner
    .register(scheduleApiModule.schedulerModule) // ✅ Temporal Engine diagnostics/runtime
    .register(settingApiModule) // ✅ 设置模块 (runtime composer)
    .register(taskComposed.module) // ✅ 任务模块
    .register(aiApiModule) // ✅ AI 模块 (runtime composer)
    .register(goalComposed.module) // ✅ 目标模块
    .register(labelApiModule) // ✅ 共享标签目录
    .register(dataPortabilityApiModule.module) // ✅ 数据导入导出模块 (runtime composer)
    .register(powerSyncApiModule) // ✅ PowerSync 同步模块
    .register(dashboardApiModule) // ✅ 仪表盘聚合模块
    .init();

  // 3. 启动监听
  app.listen(env.API_PORT, env.API_HOST, () => {
    logger.info(`✅ API server listening on http://${env.API_HOST}:${env.API_PORT}`);
  });

  // 5. 注册并启动 Cron Jobs
  scheduler = createCronScheduler({
    cleanupExpiredDeviceCodes: () => cloudAuth.cleanupExpiredDeviceCodes(),
    processAccountClosedOutbox: () =>
      new AccountClosedWorker(prisma, {
        reminderConsumer: new ReminderAccountClosedConsumer(prisma),
        notificationConsumer: new NotificationAccountClosedConsumer(prisma),
        repositoryConsumer: new RepositoryAccountClosedConsumer(prisma),
      }).processPendingMessages(),
  });
  scheduler.start();
}

/**
 * Runs the API server: executes bootstrap and, on failure, logs the fatal error
 * and exits with a non-zero code (supervisor/process manager restarts it).
 *
 * 运行 API 服务器：执行 bootstrap；失败时记录 fatal error 并以非零码退出
 * （由 supervisor/进程管理器负责重启）。
 *
 * @param trace - The initialized trace runtime (noop when OTel is disabled).
 * @returns A promise that resolves once bootstrap and listeners are up.
 */
export async function runServer(trace: TraceRuntime): Promise<void> {
  traceRuntime = trace;
  try {
    await bootstrap();
  } catch (err) {
    logger.error('❌ Fatal Error during bootstrap:', err);
    process.exit(1);
  }
}

// === 优雅关闭 ===
async function gracefulShutdown(signal: string, exitCode = 0): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  scheduler?.stop();

  if (bootstrapper) {
    await bootstrapper.destroy();
  }

  await disconnectDatabase();
  logger.info('Database disconnected');

  // Shutdown order: stop accepting/workers -> module destroy -> DB disconnect
  // -> trace forceFlush/shutdown -> process exit.
  await traceRuntime?.shutdown();

  process.exit(exitCode);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// === 进程级异常兜底 ===
// 防止未处理的 Promise 拒绝直接终止 API 进程（Node 22 默认行为），
// 与 Electron main 的 runtime-init 保持一致的可观测性。
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection in API process', reason);
});

// 未捕获异常后进程状态不可信（资源泄漏、全局状态半更新、不变量被破坏），
// 记录后走优雅关闭并以非零码退出，交由 supervisor / 编排层重启，
// 而不是带着损坏状态继续服务请求。
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in API process, shutting down', error);
  void gracefulShutdown('uncaughtException', 1).catch(() => process.exit(1));
});
