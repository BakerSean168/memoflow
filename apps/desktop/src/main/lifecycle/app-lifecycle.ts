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

import { app, BrowserWindow } from 'electron';
import { initializeDesktopFeatures } from '../desktop-features';
import { registerSystemIpcHandlers } from '../ipc/system-handlers';
import type { DesktopMainRuntime } from '../desktop-main-runtime';
import type { WindowManager } from './window-manager';
import { createLogger } from '@memoflow/utils/logger';
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
): Promise<void> {
  // Application core initialization
  await initializeApp();

  const mainRuntime = getMainRuntime();
  const runtimeManager = mainRuntime.profileRuntimeManager;

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
    });
    mainRuntime.setDesktopFeaturesRuntime(desktopFeaturesRuntime);

    // Notification capability is owned by the same registry; wire it into the runtime.
    mainRuntime.setNotification(desktopFeaturesRuntime.notification);
    console.log('[Lifecycle] Notification capability initialized');

    windowManager.setDesktopFeaturesRuntime(desktopFeaturesRuntime);

    registerSystemIpcHandlers(
      desktopFeaturesRuntime.tray,
      desktopFeaturesRuntime.shortcut,
      desktopFeaturesRuntime.autolaunch,
      desktopFeaturesRuntime.notification,
    );
    console.log('[Lifecycle] System IPC handlers registered');

    console.log('[Lifecycle] Desktop features initialized');
  }

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const candidate = await runtimeManager.getStartupProfile();
      if (await runtimeManager.hasPin(candidate.profileId)) {
        windowManager.createProfileAccessWindow();
      } else {
        const startupProfile = await runtimeManager.activateStartupProfile();
        await windowManager.transitionToMainWindow(
          startupProfile.descriptor.profileId,
          startupProfile.profileResolver.mainWindowStatePath,
        );
      }
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
 * Handles the 'before-quit' event.
 *
 * Performs cleanup tasks such as cleaning up desktop features,
 * shutting down modules, and shutting down the PowerSync runtime.
 *
 * Uses preventDefault to ensure cleanup completes before the app exits.
 */
let isQuitting = false;

async function handleBeforeQuit(
  event: Electron.Event,
  getMainRuntime: () => DesktopMainRuntime | null,
): Promise<void> {
  if (isQuitting) return; // Already handling quit — let it proceed
  isQuitting = true;
  event.preventDefault();

  console.log('[Lifecycle] Cleaning up before quit...');

  const cleanup = (async () => {
    try {
      // Dispose the main runtime (deactivates profile, shuts down PowerSync)
      const mainRuntime = getMainRuntime();
      if (mainRuntime) {
        await mainRuntime.dispose();
      }

    } catch (err) {
      console.error('[Lifecycle] Cleanup failed:', err);
    }
  })();

  // Safety timeout: if cleanup hangs, force quit after 10 seconds
  const timeout = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.warn('[Lifecycle] Cleanup timed out after 10s, forcing quit');
      resolve();
    }, 10_000);
  });

  await Promise.race([cleanup, timeout]);

  console.log('[Lifecycle] Cleanup complete, quitting...');
  app.quit();
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
): void {
  // Create window when application is ready
  app
    .whenReady()
    .then(() => handleAppReady(initializeApp, getMainRuntime as () => DesktopMainRuntime, windowManager))
    .catch((error) => {
      logger.error('App ready sequence failed', error);
      app.quit();
    });

  // Handle all windows closed
  app.on('window-all-closed', handleWindowAllClosed);

  // Cleanup before quit
  app.on('before-quit', (event) => {
    void handleBeforeQuit(event, getMainRuntime).catch((error) => {
      logger.error('Before-quit cleanup failed', error);
      app.quit();
    });
  });

  // Set security handlers
  setupSecurityHandlers();
}
