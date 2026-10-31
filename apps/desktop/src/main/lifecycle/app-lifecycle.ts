/**
 * Application Lifecycle Management
 *
 * Manages the complete lifecycle of the Electron application:
 * - app.whenReady() - Application ready, create window
 * - app.on('activate') - macOS reactivate
 * - app.on('window-all-closed') - All windows closed
 * - app.on('before-quit') - Cleanup before exit
 *
 * Desktop Profile 启动流程：
 * 1. 读取或创建持久化本地 Profile
 * 2. 依据本地 PIN policy 决定直接打开或进入解锁窗口
 * 3. Profile 打开后独立恢复云端连接，不以 cloud session 控制本地准入
 *
 * @module lifecycle/app-lifecycle
 */

import { app, dialog } from 'electron';
import path from 'node:path';
import { getSharedPathResolver } from '../runtime-init';
import { DesktopLifecyclePreference } from './desktop-lifecycle-preference';
import { claimWindowsInstance } from './windows-instance';
import { initializeDesktopFeatures } from '../desktop-features';
import { registerKeyboardHandlers } from '../ipc/keyboard-handlers';
import { registerSystemIpcHandlers } from '../ipc/system-handlers';
import type { DesktopMainRuntime } from '../desktop-main-runtime';
import type { WindowManager } from './window-manager';
import type { DesktopShutdownCoordinator } from './desktop-shutdown-coordinator';
import { createBeforeQuitHandler } from './before-quit-handler';
import { createLogger } from '@memoflow/utils/logger';
import {
  resolveDesktopUpdateE2EConfig,
  runDesktopUpdateE2EHarness,
} from '../modules/desktop-update/runtime/desktop-update-e2e-harness';
const logger = createLogger('AppLifecycle');

/**
 * Handles the application 'ready' event.
 *
 * Profile Access is the only Desktop application gate.
 *
 * @param {() => Promise<void>} initializeApp - The application initialization function to be called.
 * @returns {Promise<void>} A promise that resolves when initialization is complete.
 */
async function handleAppReady(
  initializeApp: () => Promise<void>,
  getMainRuntime: () => DesktopMainRuntime,
  windowManager: WindowManager,
  lifecyclePreference: DesktopLifecyclePreference,
): Promise<void> {
  // Application core initialization
  await initializeApp();

  const mainRuntime = getMainRuntime();
  const runtimeManager = mainRuntime.profileRuntimeManager;
  registerKeyboardHandlers(() => runtimeManager.getActiveProfileResolver());

  // Local Profile is the desktop access gate. Cloud authentication is optional
  // and must never decide whether local data can be opened.
  windowManager.setRuntimeManager(runtimeManager);
  const startupProfile = await runtimeManager.getStartupProfile();
  if (await runtimeManager.hasPin(startupProfile.profileId)) {
    windowManager.createProfileAccessWindow();
  } else {
    const startup = await runtimeManager.activateStartupProfile();
    await windowManager.transitionToMainWindow(
      startup.descriptor.profileId,
      startup.profileResolver.mainWindowStatePath,
    );
  }
  const win = windowManager.getMainWindow() ?? windowManager.getProfileAccessWindow();
  console.log('[Lifecycle] Desktop Profile access initialized');

  // Initialize desktop capabilities via the CapabilityRegistry (degradation-gated).
  // Each capability is constructed through its Electron-first factory; a failed
  // capability (tray/shortcut/auto-launch/notification) degrades to an unavailable
  // port instead of aborting startup.
  if (win) {
    const desktopFeaturesRuntime = await initializeDesktopFeatures({
      mainWindow: win,
      windowManager,
      lifecyclePreference,
      resolveDeviceNotificationPreferencePath: () =>
        runtimeManager.getActiveProfileResolver()?.desktopNotificationPreferencePath ?? null,
    });
    mainRuntime.setDesktopFeaturesRuntime(desktopFeaturesRuntime);

    // Notification capability is owned by the same registry; wire it into the runtime.
    mainRuntime.setNotification(desktopFeaturesRuntime.notification);
    console.log('[Lifecycle] Notification capability initialized');

    windowManager.setDesktopFeaturesRuntime(desktopFeaturesRuntime);
    windowManager.setStartupHidden(false);
    if (!desktopFeaturesRuntime.tray) {
      windowManager.focusActiveWindow();
      if (process.platform === 'win32') {
        void dialog.showMessageBox(win, {
          type: 'warning',
          message: app.getLocale().startsWith('zh')
            ? '系统托盘不可用。关闭窗口将退出 MemoFlow，后台提醒将停止。'
            : 'System tray unavailable. Closing MemoFlow will quit and stop background reminders.',
        });
      }
    } else if (
      !(
        process.platform === 'win32' &&
        process.argv.includes('--hidden') &&
        lifecyclePreference.startHidden
      )
    ) {
      windowManager.focusActiveWindow();
    }

    registerSystemIpcHandlers(
      desktopFeaturesRuntime.tray,
      desktopFeaturesRuntime.shortcut,
      desktopFeaturesRuntime.autolaunch,
      desktopFeaturesRuntime.notification,
    );
    console.log('[Lifecycle] System IPC handlers registered');

    console.log('[Lifecycle] Desktop features initialized');
  }

  const desktopUpdateE2EConfig = resolveDesktopUpdateE2EConfig({
    isPackaged: app.isPackaged,
    env: process.env,
  });
  if (desktopUpdateE2EConfig) {
    await runDesktopUpdateE2EHarness({
      config: desktopUpdateE2EConfig,
      currentVersion: app.getVersion(),
      update: mainRuntime.desktopUpdateCoordinator,
      install: mainRuntime.desktopUpdateInstallCoordinator,
      receiptStore: mainRuntime.desktopUpdateReceiptStore,
      quitVerifiedCandidate: () => app.quit(),
      failProcess: () => app.exit(1),
    });
  }

  // Restore through the local gate even if a notification/auxiliary window survives.
  let restoringWindow = false;
  app.on('activate', async () => {
    if (windowManager.focusActiveWindow() || windowManager.getActiveWindow() || restoringWindow)
      return;
    restoringWindow = true;
    try {
      const candidate = await runtimeManager.getStartupProfile();
      if (await runtimeManager.hasPin(candidate.profileId)) {
        await runtimeManager.deactivateProfile({ preserveSelection: true });
        windowManager.createProfileAccessWindow();
      } else {
        const startupProfile = await runtimeManager.activateStartupProfile();
        await windowManager.transitionToMainWindow(
          startupProfile.descriptor.profileId,
          startupProfile.profileResolver.mainWindowStatePath,
        );
      }
    } catch (error) {
      logger.error('Could not restore Desktop Profile gate', error);
      windowManager.createProfileAccessWindow();
    } finally {
      restoringWindow = false;
    }
  });
}

/**
 * Handles the 'window-all-closed' event.
 *
 * On macOS, the application stays active until explicitly quit.
 * On other platforms, the application quits.
 */
function handleWindowAllClosed(): void {
  // macOS: Keep application active until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
}

/**
 * Sets up security handlers to prevent unwanted window creation.
 *
 * Denies all new window requests from web contents.
 */
function setupSecurityHandlers(): void {
  app.on('web-contents-created', (_, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}

/**
 * Registers all application lifecycle event handlers.
 *
 * Sets up handlers for 'ready', 'window-all-closed', 'before-quit' events,
 * and configures security policies.
 *
 * @param {() => Promise<void>} initializeApp - The function to initialize the application logic.
 * @param {() => DesktopMainRuntime | null} getMainRuntime - Returns the main runtime (or null if not yet initialized).
 * @param {WindowManager} windowManager - The shared window manager instance.
 */
export function registerAppLifecycleHandlers(
  initializeApp: () => Promise<void>,
  getMainRuntime: () => DesktopMainRuntime | null,
  windowManager: WindowManager,
  shutdownCoordinator: DesktopShutdownCoordinator,
): void {
  let startupComplete = false;
  let activationPending = false;
  const restore = () => {
    if (!startupComplete) {
      activationPending = true;
      return;
    }
    if (!windowManager.focusActiveWindow()) app.emit('activate');
  };
  if (!claimWindowsInstance(app, restore)) return;
  const preference = new DesktopLifecyclePreference(
    path.join(getSharedPathResolver().configDir, 'desktop-lifecycle.json'),
  );
  windowManager.configureCloseBehavior(
    preference,
    () => shutdownCoordinator.shouldAllowProcessExit,
  );
  windowManager.setStartupHidden(
    process.platform === 'win32' && process.argv.includes('--hidden') && preference.startHidden,
  );

  // Create window when application is ready
  app
    .whenReady()
    .then(() =>
      handleAppReady(
        initializeApp,
        getMainRuntime as () => DesktopMainRuntime,
        windowManager,
        preference,
      ),
    )
    .then(() => {
      startupComplete = true;
      if (activationPending) restore();
    })
    .catch((error) => {
      logger.error('App ready sequence failed', error);
      app.quit();
    });

  // Handle all windows closed
  app.on('window-all-closed', handleWindowAllClosed);

  // Cleanup before quit. DesktopShutdownCoordinator owns destructive cleanup;
  // this bridge owns only the normal Electron quit terminal action.
  const beforeQuitHandler = createBeforeQuitHandler(shutdownCoordinator, () => app.quit());
  app.on('before-quit', (event) => {
    void beforeQuitHandler(event).catch((error) => {
      logger.error('Before-quit shutdown coordination failed', error);
      if (!shutdownCoordinator.shouldAllowProcessExit) {
        try {
          shutdownCoordinator.beginTerminalExit('normal-quit');
        } catch {
          // If another shutdown reason owns the process, do not bypass it.
          return;
        }
      }
      app.quit();
    });
  });

  // Set security handlers
  setupSecurityHandlers();
}
