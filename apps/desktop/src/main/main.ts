/**
 * Electron Main Process Entry Point
 *
 * Two-phase startup for multi-profile architecture:
 *
 * Phase A — Shell Runtime (runs at app start):
 *   - Shared paths, ProfileRegistry, DesktopProfileRuntimeManager
 *   - Login window and shared auth IPC
 *
 * Phase B — Profile Runtime (runs after successful login):
 *   - Per-profile PowerSync database
 *   - Per-profile ElectronBootstrapper with all business modules
 *   - Main window and schedule runtime
 */

import './runtime-init';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { powerMonitor } from 'electron';
import { initMemoryMonitorForDev, registerCacheIpcHandlers } from './utils';
import { registerAppLifecycleHandlers } from './lifecycle';
import { ElectronBootstrapper } from './bootstrap';
import { registerDashboardIpcHandler } from './ipc/dashboard-handler';

// ── Module Electron Entry Points ─────────────────────────────────────
import { PowerSyncTaskBindingReadPort } from '@memoflow/task';
import { createGoalTaskProgressPowerSyncHandler } from '@memoflow/goal';
import { createTaskReminderScheduledHandlerRegistration } from '@memoflow/task/schedule-execution';
import { createTaskPowerSyncScheduleProjectionSource } from '@memoflow/task/schedule-projection';
import { createScheduleOrchestrationModule } from '@memoflow/schedule-orchestration';
import { createGoalPowerSyncReminderFireHandler } from '@memoflow/goal/schedule-execution';
import { createGoalPowerSyncScheduleProjectionSource } from '@memoflow/goal/schedule-projection';
import {
  createLocalVaultRuntime,
  createElectronLocalVaultPlatform,
  LocalVaultRuntimeError,
} from '@memoflow/repository/electron';
import { createSchedulePowerSyncRepositories } from '@memoflow/schedule';
import { createSchedulerPowerSyncRepositories } from '@memoflow/scheduler';
import { LabelService, PowerSyncLabelRepository } from '@memoflow/label';
import { createSystemClock } from '@memoflow/time';
import { createLabelElectronModule } from './modules/label/label.electron-module';
import { composeGovernance } from './runtime/compose-governance';
import { composeGoal } from './runtime/compose-goal';
import { composeTask } from './runtime/compose-task';
import { composeAccount } from './runtime/compose-account';
import { composeNotification } from './runtime/compose-notification';
import { composeReminder } from './runtime/compose-reminder';
import { PowerSyncProtocolSessionStore } from '@memoflow/reminder/server';
import { createProtocolSessionRuntime } from '@memoflow/reminder/routine-runtime';
import {
  createFocusWindowController,
  createFocusWindowElectronModule,
  createInterventionWindowController,
  createInterventionWindowElectronModule,
  ElectronFocusTaskbarAdapter,
  ElectronFocusWindowHost,
  ElectronInterventionWindowHost,
  type FocusWindowController,
  type InterventionWindowController,
} from './modules/routine';
import { composeSchedule } from './runtime/compose-schedule';
import { composeSetting } from './runtime/compose-setting';
import { composeDataPortability } from './runtime/compose-data-portability';
import { composeAI } from './runtime/compose-ai';
import { composeRepository } from './runtime/compose-repository';
import { DesktopAnalyticsReadAdapter } from './modules/ai/desktop-analytics-read.adapter';
import { DesktopKnowledgeNotePersistenceAdapter } from './modules/ai/desktop-knowledge-note-persistence.adapter';
import { DesktopKnowledgeSourceAdapter } from './modules/ai/desktop-knowledge-source.adapter';
import {
  getDesktopDashboardData,
  type DashboardReadDependencies,
} from './services/dashboard-read-service';
import { configureDesktopShellIdentity } from './utils/app-icon';
import { getApiBaseUrl } from './utils/api-config';
import { createLogger } from '@memoflow/utils/logger';
import type { AccountClosureReceiptDTO } from '@memoflow/contracts/account';
import { createRuntimeOwnership } from '@memoflow/contracts/primitives';
import { ResultErrorException } from '@memoflow/contracts/result';
import { getSharedPathResolver } from './runtime-init';
import { WindowManager } from './lifecycle/window-manager';
import type { ProfilePathResolver } from './paths';
import { ProfileRegistry } from './profile/profile-registry';
import { DesktopProfileRuntimeManager } from './profile/desktop-profile-runtime-manager';
import { registerProfileAccessIpc } from './profile/profile-access-ipc';
import { registerCloudAuthIpc } from './profile/cloud-auth-ipc';
import { CloudSessionStore } from './profile/cloud-session-store';
import { DesktopCloudConnectionManager } from './profile/desktop-cloud-connection-manager';
import { DesktopCloudConnectionService } from './profile/desktop-cloud-connection-service';
import { DeviceAuthCoordinator } from './profile/device-auth-coordinator';
import type { PowerSyncDatabase } from '@powersync/node';
import { KnowledgeRepositoryRemoteGateway } from './modules/repository/knowledge-repository-remote.gateway';
import { DesktopKnowledgeRepositoryGitRuntime } from './modules/repository/desktop-knowledge-repository-git.runtime';
import { DesktopKnowledgeRepositoryReconciliationService } from './modules/repository/desktop-knowledge-repository-reconciliation.service';
import { DesktopKnowledgeRepositorySyncService } from './modules/repository/desktop-knowledge-repository-sync.service';
import { DesktopKnowledgeRepositoryAutoSyncScheduler } from './modules/repository/desktop-knowledge-repository-auto-sync.scheduler';
import { DesktopMainRuntime } from './desktop-main-runtime';

configureDesktopShellIdentity();

const logger = createLogger('DesktopMain');
let mainRuntime: DesktopMainRuntime | null = null;
const windowManager = new WindowManager();
let activeFocusWindowController: FocusWindowController | null = null;
let activeInterventionWindowController: InterventionWindowController | null = null;
let activeReminderActivityRuntime: { stop: () => void } | null = null;
let activeReminderUsageRuntime: { stop: () => void } | null = null;

// Composed Goal/Task repository view for the active profile. The dashboard IPC
// handler is registered once at shell init, but the repositories only exist
// after a profile activates (registerBusinessModules); bridge them here.
// 当前激活 profile 的组合 Goal/Task repository view。dashboard IPC handler 在
// shell 初始化时只注册一次，而仓储要等 profile 激活（registerBusinessModules）
// 之后才存在，因此在这里做桥接。
let activeProfileDashboardRepositories: DashboardReadDependencies | null = null;

/**
 * Register all business modules on a bootstrapper for the active profile.
 * Called by DesktopProfileRuntimeManager during profile activation.
 */
async function registerBusinessModules(
  bootstrapper: ElectronBootstrapper,
  db: PowerSyncDatabase,
  profilePaths: ProfilePathResolver,
  getCloudAccessToken: () => Promise<string | null>,
  closeCurrentCloudConnection: () => Promise<void>,
): Promise<void> {
  const startTime = performance.now();

  // R0-1：runtime ownership —— 明确"哪个宿主在运行、当前进程是谁"。
  // Desktop 是本地 scheduler 宿主（schedule.runtime 的内存队列），
  // 与 cloud API 分开记录，供双宿主对账。
  const ownership = createRuntimeOwnership('desktop-local', undefined, () => new Date());
  logger.info('[runtime-ownership] Desktop host ownership', ownership);

  // Local Vault routes `openInObsidian` through the single registry-owned
  // ExternalEditorPort (CapabilityRegistry gates degradation), not through a
  // second Electron `shell` provider. The port is resolved lazily at use-time:
  // business modules compose before the CapabilityRegistry exists, but
  // `openInObsidian` only runs on a later IPC gesture, by which time the
  // registry is bound. Directory selection stays Electron's native dialog.
  //
  // An unavailable capability rejects explicitly (bounded, with no local path
  // or URI leaked) so the existing IPC error boundary reports the failure
  // instead of a caller silently believing the vault was opened.
  const localVaultPlatform = createElectronLocalVaultPlatform({
    openExternal: (uri): Promise<void> => {
      void uri;
      const editor = mainRuntime?.externalEditor;
      if (!editor) {
        // Bounded, explicit rejection (no local path or URI leaked) that the
        // existing Local Vault IPC error boundary maps to a failure result.
        return Promise.reject(
          new LocalVaultRuntimeError('INTERNAL_ERROR', 'External editor capability is unavailable'),
        );
      }
      return editor.openExternal(uri);
    },
  });
  const localVaultRuntime = createLocalVaultRuntime({
    bindingFilePath: profilePaths.localVaultBindingPath,
    writeLedgerFilePath: profilePaths.localVaultWriteLedgerPath,
    platform: localVaultPlatform,
  });

  // Step D：宿主 runtime 负责 feature 装配。通知/提醒 composer 先于 schedule
  // 编排（编排消费它们返回的 source/notification ports），schedule 采用两阶段
  // 装配（单一 PowerSync 集合，scheduleTaskRepository 与编排共享，不建第二套）。
  // 1. Raw schedule ingredient set — the ONE two-phase schedule repository set.
  //    原始 schedule 原料集合 —— 唯一的、两阶段的 schedule 仓储集合。
  const calendarRepositorySet = createSchedulePowerSyncRepositories(db);
  const schedulerRepositorySet = createSchedulerPowerSyncRepositories(db);

  // 2. Notification/reminder composers FIRST — schedule orchestration consumes
  //    their returned source/notification ports. Desktop channel capabilities are
  //    explicit (InApp + Desktop) so no package default decides host policy.
  //    先组装通知/提醒 composer —— schedule 编排消费它们返回的 source/notification
  //    ports。桌面 channel capabilities 显式声明（InApp + Desktop），杜绝包默认值
  //    替宿主决定策略。
  const settingElectronModule = composeSetting({ db });
  const notificationComposed = composeNotification({
    db,
    userTimeContextPort: settingElectronModule.userTimeContextPort,
    desktopRenderer: (dto) => {
      const renderer = mainRuntime?.notification;
      if (!renderer) return false;
      const payload = dto as Record<string, unknown>;
      return renderer.show({
        title: String(payload.title ?? 'Notification'),
        body: String(payload.content ?? ''),
        data: {
          notificationId: payload.id,
          identityId: payload.identityId,
          notificationType: payload.type,
          notificationCategory: payload.category,
        },
      });
    },
    channelCapabilities: [
      { channelType: 'InApp', status: 'available' },
      { channelType: 'Desktop', status: 'available' },
    ],
  });
  const profileIdentityId = mainRuntime?.profileRuntimeManager.getCurrentIdentityId();
  if (!profileIdentityId) {
    throw new Error(
      'Reminder local Routine runtime requires an active or prepared profile identity',
    );
  }
  const reminderComposed = composeReminder({
    db,
    identityId: profileIdentityId,
    notificationRequestedWriter: notificationComposed.requestedWriter,
    userTimeContextPort: settingElectronModule.userTimeContextPort,
  });
  // Project the durable vNext Routine snapshot before sensors start so the first
  // activity transition cannot race ahead of registration. ROUTINE-5301 can
  // reuse the same refresh seam after configuration mutations.
  await reminderComposed.refreshLocalRoutineRegistrations();
  // Activity truth is a per-profile runtime. Start the sensor before the
  // accumulator so no idle/resume transition is lost during activation.
  reminderComposed.activityRuntime.start();
  reminderComposed.activeUsageRuntime.start();
  activeReminderActivityRuntime = reminderComposed.activityRuntime;
  activeReminderUsageRuntime = reminderComposed.activeUsageRuntime;

  // Routine InterventionWindow is a Main Process projection over the per-profile
  // InterventionRuntime returned by the Reminder composition root. It owns only
  // one low-intrusion BrowserWindow; occurrence truth remains in the runtime.
  const interventionWindowHost = new ElectronInterventionWindowHost();
  const interventionWindowController = createInterventionWindowController({
    runtime: reminderComposed.interventionRuntime,
    host: interventionWindowHost,
  });
  const interventionWindowElectronModule = createInterventionWindowElectronModule(
    interventionWindowController,
  );
  activeInterventionWindowController = interventionWindowController;

  // Routine FocusWindow is a Main Process projection over the durable ProtocolSession.
  // Closing/hiding the window never owns session termination; all state commands go
  // through ProtocolSessionRuntime and its optimistic-versioned PowerSync store.
  const protocolSessionStore = new PowerSyncProtocolSessionStore(db);
  const protocolSessionRuntime = createProtocolSessionRuntime({
    store: protocolSessionStore,
    protocolBreakCreditRuntime: reminderComposed.protocolBreakCreditRuntime,
  });
  const focusWindowHost = new ElectronFocusWindowHost();
  const focusWindowController = createFocusWindowController({
    store: protocolSessionStore,
    runtime: protocolSessionRuntime,
    host: focusWindowHost,
    taskbar: new ElectronFocusTaskbarAdapter(() => focusWindowHost.browserWindow),
  });
  const focusWindowElectronModule = createFocusWindowElectronModule(focusWindowController);
  activeFocusWindowController = focusWindowController;

  // 3. Schedule orchestration using the single schedule-task repository, then the
  //    two-phase schedule composer. The runtime controller is the ONLY schedule
  //    start/stop owner in the desktop lane (replaces the retired schedule
  //    runtime package globals).
  //    schedule 编排使用同一个 schedule-task 仓储，随后进行两阶段 schedule 组装。
  //    runtime controller 是桌面 lane 中 schedule 启停的唯一所有者（取代已退役的
  //    schedule runtime 包级全局）。
  const scheduleOrchestrationModule = createScheduleOrchestrationModule({
    taskProjection: {
      source: createTaskPowerSyncScheduleProjectionSource(
        db,
        settingElectronModule.userTimeContextPort,
      ),
      scheduleTaskRepository: schedulerRepositorySet.scheduleTaskRepository,
    },
    goalProjection: {
      source: createGoalPowerSyncScheduleProjectionSource(
        db,
        settingElectronModule.userTimeContextPort,
      ),
    },
    reminderProjection: {
      source: reminderComposed.scheduleProjectionSource,
    },
    execution: {
      reminderSource: reminderComposed.scheduleExecutionSource,
    },
  });
  scheduleOrchestrationModule.handlerRegistry.register(
    createGoalPowerSyncReminderFireHandler(db, notificationComposed.requestedWriter),
  );
  const scheduleComposed = composeSchedule({
    calendarRepositories: calendarRepositorySet,
    schedulerRepositories: schedulerRepositorySet,
    sourceExecutor: scheduleOrchestrationModule.sourceExecutor,
    shouldScheduleTask: (task) => {
      const identityId = mainRuntime?.profileRuntimeManager.getCurrentIdentityId() ?? null;
      return identityId !== null && String(task.identityId) === identityId;
    },
  });

  // 4. Goal/task composers (existing reference), then the expanded dashboard
  //    repository view (schedule/reminder/notification ports included).
  //    goal/task composer（既有参考），随后是扩展后的 dashboard 仓储视图（含
  //    schedule/reminder/notification ports）。
  const taskComposed = composeTask({
    db,
    runtimeContributions: scheduleOrchestrationModule.projectionRuntime,
    goalProgressHandler: createGoalTaskProgressPowerSyncHandler(db),
    userTimeContextPort: settingElectronModule.userTimeContextPort,
  });
  // Register the Task reminder fire handler so scheduled `task.reminder` work
  // (e.g. a one-time task + relative reminder) is executed by the registry-based
  // source executor. Desktop enqueues the durable NotificationRequested envelope
  // into the shared outbox consumed by the notification durable runtime.
  scheduleOrchestrationModule.handlerRegistry.register(
    createTaskReminderScheduledHandlerRegistration({
      taskOccurrenceRepository: taskComposed.repositories.taskOccurrenceRepository,
      taskPlanRepository: taskComposed.repositories.taskPlanRepository,
      notificationRequestedWriter: notificationComposed.repositories.requestedWriter,
    }),
  );
  const taskElectronModule = taskComposed.module;

  const goalComposed = composeGoal({
    db,
    taskBindingReadPort: new PowerSyncTaskBindingReadPort(db),
    userTimeContextPort: settingElectronModule.userTimeContextPort,
  });

  const labelService = new LabelService(new PowerSyncLabelRepository(db), {
    clock: createSystemClock(),
  });
  const labelElectronModule = createLabelElectronModule({ service: labelService });

  const dashboardRepositories: DashboardReadDependencies = {
    goalRepository: goalComposed.repositories.goalRepository,
    taskPlanRepository: taskComposed.repositories.taskPlanRepository,
    taskOccurrenceRepository: taskComposed.repositories.taskOccurrenceRepository,
    scheduleRepository: scheduleComposed.repositories.scheduleRepository,
    scheduleTaskRepository: scheduleComposed.repositories.scheduleTaskRepository,
    reminderTemplateRepository: reminderComposed.repositories.reminderTemplateRepository,
    notificationRepository: notificationComposed.repositories.notificationRepository,
    userTimeContextPort: settingElectronModule.userTimeContextPort,
  };
  activeProfileDashboardRepositories = dashboardRepositories;

  // 5. Account/data-portability/setting/AI/repository with explicit instances.
  //    account/data-portability/setting/AI/repository 均以显式实例组装。
  const accountComposed = composeAccount({
    db,
    clock: createSystemClock(),
    syncOptions: {
      getCloudAccountId: () =>
        mainRuntime?.profileRuntimeManager.getActiveProfileDescriptorSync()?.cloudBinding
          ?.cloudAccountId ?? null,
      getCloudAccessToken,
      async updateLocalProfileMetadata(request) {
        if (request.nickname === undefined) return;
        const profileId = mainRuntime?.profileRuntimeManager.getActiveProfileId();
        if (!profileId) return;
        await mainRuntime?.profileRuntimeManager.updateProfileDisplayName(
          profileId,
          request.nickname,
        );
      },
      async pushCloudProfile(token, request) {
        const response = await fetch(`${getApiBaseUrl()}/accounts/me`, {
          method: 'PUT',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(request),
        });
        const envelope = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: { message?: string };
        } | null;
        if (!response.ok || envelope?.ok !== true) {
          throw new ResultErrorException(
            '云端账户资料同步失败',
            'REMOTE_SYNC_FAILED',
            undefined,
            undefined,
            undefined,
            envelope?.error,
          );
        }
      },
      async closeCloudAccount(token, request) {
        const response = await fetch(`${getApiBaseUrl()}/accounts/me/close`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(request),
        });
        const envelope = (await response.json().catch(() => null)) as {
          ok?: boolean;
          data?: unknown;
          error?: { message?: string };
        } | null;
        if (!response.ok || envelope?.ok !== true) {
          throw new ResultErrorException(
            '云端账号关闭失败',
            'REMOTE_ACCOUNT_CLOSE_FAILED',
            undefined,
            undefined,
            undefined,
            envelope?.error,
          );
        }
        return envelope.data as AccountClosureReceiptDTO;
      },
      async markAccountClosing() {
        const identityId =
          mainRuntime?.profileRuntimeManager.getActiveProfileDescriptorSync()?.cloudBinding
            ?.cloudAccountId;
        if (!identityId) {
          throw new Error('Cannot mark account closing: active profile has no cloud binding');
        }
        await db.execute(
          'INSERT OR IGNORE INTO account_closure_requested (identity_id, requested_at) VALUES (?, ?)',
          [identityId, Date.now()],
        );
      },
      async clearAccountClosingMarker(identityId: string) {
        await db.execute('DELETE FROM account_closure_requested WHERE identity_id = ?', [
          identityId,
        ]);
      },
      async afterCloudAccountClosed() {
        // NOTE: the closure-request marker is intentionally NOT cleared here.
        // Token/sync are revoked below, but the active local Profile runtime stays
        // alive — the marker keeps local new-work blocked until the cloud account
        // row syncs to a non-Active status (status check then covers it). It is
        // cleared only when the cloud close FAILS (close handler catch path).
        await closeCurrentCloudConnection();
      },
    },
  });

  const analyticsReadAdapter = new DesktopAnalyticsReadAdapter({
    goalRepository: goalComposed.repositories.goalRepository,
    taskPlanRepository: taskComposed.repositories.taskPlanRepository,
    taskOccurrenceRepository: taskComposed.repositories.taskOccurrenceRepository,
    userTimeContextPort: settingElectronModule.userTimeContextPort,
    dashboardDataLoader: (identityId) => getDesktopDashboardData(identityId, dashboardRepositories),
  });

  const AIElectronModule = composeAI({
    db,
    knowledgeNotePersistence: new DesktopKnowledgeNotePersistenceAdapter(localVaultRuntime),
    knowledgeSourcePort: new DesktopKnowledgeSourceAdapter(localVaultRuntime),
    analyticsReadPort: analyticsReadAdapter,
    goalApplicationPort: goalComposed.applicationPort,
    taskApplicationPort: taskComposed.applicationPort,
    reminderApplicationPort: reminderComposed.applicationPort,
    routineCommandPort: reminderComposed.routineCommandPort,
    scheduleRepository: scheduleComposed.repositories.scheduleRepository,
    notificationRepository: notificationComposed.repositories.notificationRepository,
    userTimeContextPort: settingElectronModule.userTimeContextPort,
    labelService,
    mastraStorage: {
      kind: 'libsql',
      url: pathToFileURL(path.join(profilePaths.storageDir, 'mastra.db')).href,
    },
  });

  const dataPortabilityElectronModule = composeDataPortability({ db });

  const knowledgeRepositoryRemoteGateway = new KnowledgeRepositoryRemoteGateway({
    getAccessToken: getCloudAccessToken,
  });
  const knowledgeRepositoryGitRuntime = new DesktopKnowledgeRepositoryGitRuntime();
  const knowledgeRepositoryReconciliationService =
    new DesktopKnowledgeRepositoryReconciliationService({
      localVault: localVaultRuntime,
      remote: knowledgeRepositoryRemoteGateway,
      gitRuntime: knowledgeRepositoryGitRuntime,
    });
  const knowledgeRepositorySyncService = new DesktopKnowledgeRepositorySyncService({
    localVault: localVaultRuntime,
    remote: knowledgeRepositoryRemoteGateway,
    gitRuntime: knowledgeRepositoryGitRuntime,
  });
  const knowledgeRepositoryAutoSyncScheduler = new DesktopKnowledgeRepositoryAutoSyncScheduler({
    localVault: localVaultRuntime,
    remote: knowledgeRepositoryRemoteGateway,
    synchronization: knowledgeRepositorySyncService,
    lifecycle: {
      onNetworkOnline(listener) {
        void listener;
        return () => undefined;
      },
      onSystemResume(listener) {
        let resumeTimer: ReturnType<typeof setTimeout> | null = null;
        const handleResume = () => {
          if (resumeTimer) clearTimeout(resumeTimer);
          resumeTimer = setTimeout(listener, 2_000);
          resumeTimer.unref?.();
        };
        powerMonitor.on('resume', handleResume);
        return () => {
          powerMonitor.off('resume', handleResume);
          if (resumeTimer) clearTimeout(resumeTimer);
        };
      },
    },
    stateFilePath: profilePaths.knowledgeRepositoryAutoSyncStatePath,
  });
  const repositoryElectronModule = composeRepository({
    localVaultPort: localVaultRuntime,
    knowledgeRepositoryConnectionPort: knowledgeRepositoryRemoteGateway,
    knowledgeRepositoryReconciliationPort: knowledgeRepositoryReconciliationService,
    knowledgeRepositorySyncPort: knowledgeRepositorySyncService,
    knowledgeRepositoryAutoSyncScheduler,
  });

  const governanceElectronModule = composeGovernance({ db });

  // Schedule runtime controller wiring: the SAME composed controller is handed
  // to both lifecycle owners (WindowManager drives delayed start/stop on window
  // transitions; the profile manager stops it on deactivation before teardown).
  // schedule runtime controller 接线：同一组装 controller 同时交给两个生命周期
  // 所有者（WindowManager 在窗口切换时驱动延迟启停；profile manager 在停用拆除前
  // 停止它）。
  windowManager.setScheduleRuntimeController(scheduleComposed.runtimeController);
  mainRuntime?.profileRuntimeManager.setScheduleRuntimeController(
    scheduleComposed.runtimeController,
  );

  await bootstrapper
    // Core services
    .register(accountComposed.module)
    .register(settingElectronModule)
    .register(notificationComposed.module)
    .register(dataPortabilityElectronModule)
    // Feature modules
    .register(goalComposed.module)
    .register(labelElectronModule)
    .register(taskElectronModule)
    .register(scheduleComposed.calendarModule)
    .register(scheduleComposed.schedulerModule)
    .register(reminderComposed.module)
    .register(interventionWindowElectronModule)
    .register(focusWindowElectronModule)
    .register(AIElectronModule)
    .register(governanceElectronModule)
    .register(repositoryElectronModule);

  const initTime = performance.now() - startTime;
  logger.info(`Business modules registered in ${initTime.toFixed(2)}ms`);
}

// ═══════════════════════════════════════════════════════════════════════
// Shell Runtime Initialization
// ═══════════════════════════════════════════════════════════════════════

/**
 * Initialize the shell runtime — shared infrastructure that runs before
 * any profile is selected. This is what runs at app startup.
 */
async function initializeShellRuntime(): Promise<void> {
  const startTime = performance.now();
  console.log('[Shell] Initializing shell runtime...');

  const sharedResolver = getSharedPathResolver();
  console.log(`[Shell] Root path: ${sharedResolver.rootDir}`);

  // Initialize ProfileRegistry
  const profileRegistry = new ProfileRegistry(sharedResolver);
  await profileRegistry.load();
  console.log('[Shell] ProfileRegistry initialized');

  const profileRuntimeManager = new DesktopProfileRuntimeManager(
    sharedResolver,
    profileRegistry,
    createSystemClock(),
  );
  const cloudSessionStore = new CloudSessionStore(sharedResolver.rootDir);
  const cloudConnectionManager = new DesktopCloudConnectionManager(
    cloudSessionStore,
    profileRuntimeManager,
  );
  const cloudConnectionService = new DesktopCloudConnectionService(
    profileRuntimeManager,
    cloudSessionStore,
  );
  const deviceAuthCoordinator = new DeviceAuthCoordinator(
    profileRuntimeManager,
    cloudConnectionService,
  );

  // Assemble the explicit runtime owner
  mainRuntime = new DesktopMainRuntime(windowManager, profileRuntimeManager);
  mainRuntime.setDeviceAuthCoordinator(deviceAuthCoordinator);
  registerProfileAccessIpc(
    profileRegistry,
    profileRuntimeManager,
    cloudConnectionManager,
    deviceAuthCoordinator,
  );
  registerCloudAuthIpc(
    profileRegistry,
    profileRuntimeManager,
    cloudSessionStore,
    deviceAuthCoordinator,
  );

  // Set up module registration — this closure captures the business module
  // creation logic and provides it to the runtime manager for profile activation
  profileRuntimeManager.setModuleRegistration(async (bootstrapper, db, profilePaths) => {
    await registerBusinessModules(
      bootstrapper,
      db,
      profilePaths,
      async () => {
        const profileId = profileRuntimeManager.getActiveProfileId();
        return profileId ? cloudSessionStore.getValidToken(profileId) : null;
      },
      async () => {
        const profileId = profileRuntimeManager.getActiveProfileId();
        if (profileId) await cloudSessionStore.remove(profileId);
        await profileRuntimeManager.disableCloudSync();
      },
    );
  });
  profileRuntimeManager.setAfterActivation(async (profile) => {
    await cloudConnectionManager.restore(profile).catch((error) => {
      logger.warn('Cloud connection restore failed; Profile remains locally available', { error });
    });
    try {
      activeInterventionWindowController?.restoreIdentity(profile.localOwnerId);
    } catch (error) {
      logger.warn('InterventionWindow restore failed; InterventionRuntime remains authoritative', {
        error,
      });
    }
    await activeFocusWindowController?.restoreIdentity(profile.localOwnerId).catch((error) => {
      logger.warn('FocusWindow restore failed; ProtocolSession remains durable', { error });
    });
  });
  profileRuntimeManager.setBeforeDeactivation(() => {
    activeReminderUsageRuntime?.stop();
    activeReminderActivityRuntime?.stop();
    activeReminderUsageRuntime = null;
    activeReminderActivityRuntime = null;
    activeProfileDashboardRepositories = null;
    activeInterventionWindowController = null;
    activeFocusWindowController = null;
    // Clear the WindowManager's bound schedule runtime controller BEFORE the
    // modules are torn down so no stale controller outlives its instance.
    // 在模块拆除前清除 WindowManager 绑定的 schedule runtime controller，
    // 避免过期 controller 越过其实例存活。
    windowManager.setScheduleRuntimeController(null);
  });

  // Cross-module event listeners (task→goal 联动) 现由 composeGoal 把
  // createGoalEventListenersRuntime 作为模块自有运行时贡献注入 GoalModuleInstance
  // （见 packages/goal/src/server/infrastructure/runtime/goal-event-listeners.runtime.ts），
  // 在 profile 激活、module start() 时随模块一起启动；不再由 shell 层集中初始化。

  // Ancillary
  initMemoryMonitorForDev();
  registerCacheIpcHandlers();
  registerDashboardIpcHandler(
    () => mainRuntime?.profileRuntimeManager.getActiveProfileAccessContext() ?? null,
    () => {
      const repositories = activeProfileDashboardRepositories;
      if (!repositories) {
        throw new Error('Dashboard IPC invoked before profile business modules were composed');
      }
      return repositories;
    },
  );

  const initTime = performance.now() - startTime;
  console.log(`[Shell] Shell runtime initialized in ${initTime.toFixed(2)}ms`);
}

// ═══════════════════════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════════════════════

registerAppLifecycleHandlers(initializeShellRuntime, () => mainRuntime, windowManager);
