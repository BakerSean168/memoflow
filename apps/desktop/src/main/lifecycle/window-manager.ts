/**
 * Window Manager - 窗口管理器
 *
 * 管理 Desktop 应用的多窗口系统：
 * - Profile Access 窗口（小窗口）
 * - 主窗口（完整应用）
 *
 * 启动流程：
 * 1. 读取最近使用的本地 Profile
 * 2. 无 PIN 时直接打开本地主窗口
 * 3. 有 PIN 时显示 Profile 解锁窗口
 * 4. 云端 session 在本地 Profile 打开后独立恢复
 */

import { BrowserWindow, ipcMain, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  RendererEventChannels,
  WindowChannels,
  ProfileIdSchema,
} from '@memoflow/contracts/electron';
import { fail, ok } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import type { ScheduleRuntimeController } from '../runtime/compose-schedule';
import { applyWindowChromeTheme, createNativeWindowChromeOptions } from './desktop-chrome';
import type { DesktopChromeTheme } from './desktop-chrome';
import { hasResolvedPreload, resolvePreloadPath } from '../utils/resolve-preload-path';
import { resolveWindowIconPath } from '../utils/app-icon';
import type { DesktopFeaturesRuntime } from '../desktop-features';
import { getDesktopDevServerUrlOrDefault, usesDesktopViteDevServer } from '../utils';
import { WindowStateManager } from '../modules/window';
import { getSharedPathResolver } from '../runtime-init';
import type { DesktopProfileRuntimeManager } from '../profile';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('WindowManager');

// ============ Types ============

export interface WindowManagerConfig {
  /** 预加载脚本路径 */
  preloadPath?: string;
  /** 开发服务器 URL */
  devServerUrl?: string;
  /** 是否为开发模式 */
  isDev?: boolean;
}

export type WindowType = 'profile-access' | 'main';

interface WindowControlsState {
  isMaximized: boolean;
  isMinimizable: boolean;
  isMaximizable: boolean;
  isClosable: boolean;
}

// ============ Window Manager ============

/**
 * 窗口管理器
 *
 * 负责创建和管理登录窗口、主窗口，处理窗口间切换
 */
export class WindowManager {
  private profileAccessWindow: BrowserWindow | null = null;
  private mainWindow: BrowserWindow | null = null;

  private readonly config: Required<WindowManagerConfig>;
  private isTransitioning = false;
  private profileNavigationPending = false;
  private activeMainProfileId: string | null = null;
  private profileAccessWindowStateManager: WindowStateManager | null = null;
  private mainWindowStateManager: WindowStateManager | null = null;
  private runtimeManager: DesktopProfileRuntimeManager | null = null;
  private desktopFeaturesRuntime: DesktopFeaturesRuntime | null = null;
  private scheduleRuntimeController: ScheduleRuntimeController | null = null;

  constructor(config: WindowManagerConfig = {}) {
    const preloadPath = config.preloadPath || resolvePreloadPath(__dirname);

    this.config = {
      preloadPath,
      devServerUrl: config.devServerUrl || getDesktopDevServerUrlOrDefault(),
      isDev: config.isDev ?? usesDesktopViteDevServer(),
    };

    if (!hasResolvedPreload(__dirname)) {
      logger.error('Resolved preload script does not exist', {
        preloadPath: this.config.preloadPath,
        currentDir: __dirname,
      });
    } else {
      logger.info('Resolved preload script', { preloadPath: this.config.preloadPath });
    }

    this.registerIpcHandlers();
  }

  /**
   * Set the runtime manager instance. Must be called before profile-dependent
   * IPC handlers (TRANSITION_TO_MAIN) are invoked.
   */
  setRuntimeManager(manager: DesktopProfileRuntimeManager): void {
    this.runtimeManager = manager;
  }

  setDesktopFeaturesRuntime(runtime: DesktopFeaturesRuntime | null): void {
    this.desktopFeaturesRuntime = runtime;
  }

  /**
   * Set the bound schedule runtime controller for the active profile.
   * 为当前激活 profile 设置绑定的 schedule runtime controller。
   *
   * The controller is the ONLY schedule start/stop owner in the desktop lane
   * (composed per profile activation and cleared before profile teardown).
   * Delayed start/stop timing is preserved: the main-window transition starts
   * the runtime, the profile-access transition and profile deactivation stop it.
   *
   * controller 是桌面 lane 中 schedule 启停的唯一所有者（按 profile 激活组装，并在
   * profile 拆除前清除）。保留延迟启停时序：主窗口切换时启动 runtime，profile-access
   * 切换与 profile 停用时停止它。
   */
  setScheduleRuntimeController(controller: ScheduleRuntimeController | null): void {
    this.scheduleRuntimeController = controller;
  }

  // ============ Window Creation ============

  /**
   * 创建 Profile Access 窗口
   */
  createProfileAccessWindow(targetProfileId?: string, interactive = true): BrowserWindow {
    if (this.profileAccessWindow && !this.profileAccessWindow.isDestroyed()) {
      this.profileAccessWindow.setEnabled(interactive);
      this.profileAccessWindow.focus();
      return this.profileAccessWindow;
    }

    logger.info('Creating Profile Access window');
    this.profileAccessWindowStateManager = new WindowStateManager('profile-access', {
      defaultWidth: 420,
      defaultHeight: 580,
      stateFilePath: getSharedPathResolver().profileAccessWindowStatePath,
    });

    const profileAccessState = this.profileAccessWindowStateManager;

    this.profileAccessWindow = new BrowserWindow({
      width: profileAccessState.width,
      height: profileAccessState.height,
      x: profileAccessState.x,
      y: profileAccessState.y,
      resizable: false,
      maximizable: false,
      minimizable: true,
      fullscreenable: false,
      autoHideMenuBar: true,
      title: '',
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.config.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        partition: this.getShellPartition(),
      },
      icon: resolveWindowIconPath(),
      show: false,
    });

    this.profileAccessWindow.setEnabled(interactive);
    this.profileAccessWindow.setMenuBarVisibility(false);
    this.profileAccessWindow.removeMenu();

    this.attachWindowDiagnostics(this.profileAccessWindow, 'profile-access');
    this.attachWindowControlStateSync(this.profileAccessWindow);
    this.profileAccessWindowStateManager.manage(this.profileAccessWindow);

    // 准备好后显示
    this.profileAccessWindow.once('ready-to-show', () => {
      this.profileAccessWindow?.show();
      logger.info('Profile Access window shown');
    });

    this.loadWindowContent(
      this.profileAccessWindow,
      targetProfileId
        ? `/profile-access?profileId=${encodeURIComponent(targetProfileId)}`
        : '/profile-access',
    );

    if (this.config.isDev) {
      this.profileAccessWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // 窗口关闭事件
    this.profileAccessWindow.on('closed', () => {
      this.profileAccessWindowStateManager?.unmanage();
      this.profileAccessWindowStateManager = null;
      this.profileAccessWindow = null;
      // 如果没有主窗口且不是在切换过程中，退出应用
      if (!this.mainWindow && !this.isTransitioning) {
        app.quit();
      }
    });

    return this.profileAccessWindow;
  }

  /**
   * 创建主窗口
   */
  createMainWindow(profileId: string, stateFilePath: string): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.focus();
      return this.mainWindow;
    }

    logger.info('Creating main window');
    this.activeMainProfileId = profileId;
    this.mainWindowStateManager = new WindowStateManager('main', {
      defaultWidth: 1200,
      defaultHeight: 800,
      stateFilePath,
    });
    const mainState = this.mainWindowStateManager;

    this.mainWindow = new BrowserWindow({
      width: mainState.width,
      height: mainState.height,
      minWidth: 900,
      minHeight: 600,
      x: mainState.x,
      y: mainState.y,
      ...createNativeWindowChromeOptions(),
      webPreferences: {
        preload: this.config.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        partition: this.getProfilePartition(profileId),
      },
      icon: resolveWindowIconPath(),
      show: false,
    });

    this.mainWindow.setMenuBarVisibility(false);
    this.mainWindow.removeMenu();

    this.attachWindowDiagnostics(this.mainWindow, 'main');
    this.attachWindowControlStateSync(this.mainWindow);
    this.mainWindowStateManager.manage(this.mainWindow);

    // 准备好后显示
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show();
      logger.info('Main window shown');
    });

    // 加载主页面
    this.loadWindowContent(this.mainWindow, '/');

    // 开发模式打开 DevTools
    if (this.config.isDev) {
      this.mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // 窗口关闭事件
    this.mainWindow.on('closed', () => {
      this.mainWindowStateManager?.unmanage();
      this.mainWindowStateManager = null;
      this.mainWindow = null;
      this.activeMainProfileId = null;
    });

    return this.mainWindow;
  }

  // ============ Window Transition ============

  /**
   * 本地 Profile 打开后切换到主窗口
   */
  async transitionToMainWindow(profileId: string, stateFilePath: string): Promise<void> {
    if (this.isTransitioning) {
      logger.warn('Already transitioning');
      return;
    }

    this.isTransitioning = true;
    logger.info('Transitioning from Profile Access to main window');

    try {
      // 1. 创建主窗口（先不显示）
      const mainWin = this.createMainWindow(profileId, stateFilePath);

      // 2. 等待主窗口准备好
      await new Promise<void>((resolve) => {
        if (mainWin.isVisible()) {
          resolve();
        } else {
          mainWin.once('ready-to-show', () => resolve());
        }
      });

      // 3. 显示主窗口
      mainWin.show();
      this.desktopFeaturesRuntime?.bindWindow(mainWin);
      await this.scheduleRuntimeController?.start();

      // Close the outgoing renderer before accepting another Profile transition.
      if (this.profileAccessWindow && !this.profileAccessWindow.isDestroyed())
        this.profileAccessWindow.close();

      logger.info('Transition complete');
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * 关闭本地 Profile 后切换到 Profile Access 窗口
   */
  async transitionToProfileAccessWindow(
    targetProfileId?: string,
    interactive = true,
  ): Promise<void> {
    if (this.isTransitioning) {
      logger.warn('Already transitioning');
      return;
    }

    this.isTransitioning = true;
    logger.info('Transitioning from main to Profile Access window');

    try {
      await this.scheduleRuntimeController?.stop();
      const profileAccessWindow = this.createProfileAccessWindow(targetProfileId, interactive);
      // Destroy the old renderer before Profile Access can select a different runtime.
      this.mainWindow?.destroy();

      // 2. 等待 Profile Access 窗口准备好
      await new Promise<void>((resolve) => {
        if (profileAccessWindow.isVisible()) {
          resolve();
        } else {
          profileAccessWindow.once('ready-to-show', () => resolve());
        }
      });

      // 3. 显示 Profile Access 窗口
      profileAccessWindow.show();
      this.desktopFeaturesRuntime?.bindWindow(profileAccessWindow);

      logger.info('Transition complete');
    } finally {
      this.isTransitioning = false;
    }
  }

  // ============ Window Access ============

  /**
   * 获取 Profile Access 窗口
   */
  getProfileAccessWindow(): BrowserWindow | null {
    return this.profileAccessWindow;
  }

  /**
   * 获取主窗口
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * 获取当前活动窗口
   */
  getActiveWindow(): BrowserWindow | null {
    return this.mainWindow || this.profileAccessWindow;
  }

  focusMainWindow(): boolean {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return false;
    }

    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }

    this.mainWindow.show();
    this.mainWindow.focus();
    return true;
  }

  // ============ Private Methods ============

  /**
   * 加载窗口内容
   */
  private loadWindowContent(window: BrowserWindow, route: string): void {
    if (this.config.isDev) {
      // 开发模式：加载 Vite dev server
      // 注意：HashRouter 使用 #/path 格式
      const hash = route === '/' ? '' : `#${route}`;
      const url = `${this.config.devServerUrl}${hash}`;
      logger.debug('Loading dev URL', { url, route });
      void window.loadURL(url).catch((error) => {
        logger.error('Failed to load dev URL', { route, url, error });
      });
    } else {
      // 生产模式：加载打包的 HTML
      const htmlPath = path.join(__dirname, '../dist-renderer/index.html');
      if (route === '/') {
        void window.loadFile(htmlPath).catch((error) => {
          logger.error('Failed to load renderer HTML file', { route, htmlPath, error });
        });
      } else {
        // 注意：hash 参数会自动添加 #
        void window.loadFile(htmlPath, { hash: route }).catch((error) => {
          logger.error('Failed to load renderer HTML file with route', {
            route,
            htmlPath,
            error,
          });
        });
      }
    }
  }

  private attachWindowDiagnostics(window: BrowserWindow, windowType: WindowType): void {
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      logger.error('Window failed to load content', {
        windowType,
        errorCode,
        errorDescription,
        validatedURL,
      });
    });

    window.webContents.on('render-process-gone', (_event, details) => {
      logger.error('Renderer process exited unexpectedly', {
        windowType,
        reason: details.reason,
        exitCode: details.exitCode,
      });
    });

    window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      logger.info('Renderer console message', {
        windowType,
        level,
        message,
        line,
        sourceId,
      });
    });
  }

  private getWindowForSender(webContentsId?: number): BrowserWindow | null {
    if (typeof webContentsId === 'number') {
      const senderWindow = BrowserWindow.getAllWindows().find(
        (window) => window.webContents.id === webContentsId,
      );
      if (senderWindow) {
        return senderWindow;
      }
    }

    return this.getActiveWindow();
  }

  private getWindowControlsState(window: BrowserWindow): WindowControlsState {
    return {
      isMaximized: window.isMaximized() || window.isFullScreen(),
      isMinimizable: window.isMinimizable(),
      isMaximizable: window.isMaximizable() || window.isFullScreenable(),
      isClosable: window.isClosable(),
    };
  }

  private emitWindowControlsState(window: BrowserWindow): WindowControlsState | null {
    if (window.isDestroyed()) {
      return null;
    }

    const state = this.getWindowControlsState(window);
    window.webContents.send(RendererEventChannels.WINDOW_STATE_CHANGED, state);
    return state;
  }

  private attachWindowControlStateSync(window: BrowserWindow): void {
    const emitState = () => {
      this.emitWindowControlsState(window);
    };

    window.on('maximize', emitState);
    window.on('unmaximize', emitState);
    window.on('enter-full-screen', emitState);
    window.on('leave-full-screen', emitState);
    window.on('restore', emitState);
    window.once('ready-to-show', emitState);
    window.webContents.on('did-finish-load', emitState);
  }

  /**
   * 注册 IPC 处理器
   */
  private registerIpcHandlers(): void {
    // 登录成功 → 切换到主窗口
    ipcMain.handle(WindowChannels.TRANSITION_TO_MAIN, async () => {
      if (this.isTransitioning)
        return fail({ code: 'WINDOW_TRANSITION_PENDING', message: 'Profile 切换正在进行' });
      logger.info('IPC window:transition-to-main received');
      if (!this.runtimeManager) {
        throw new Error('WindowManager: runtimeManager not set before TRANSITION_TO_MAIN');
      }
      const profileId = this.runtimeManager.getActiveProfileId();
      const profileResolver = this.runtimeManager.getActiveProfileResolver();
      if (!profileId || !profileResolver) {
        throw new Error('No active profile available for main window transition');
      }
      await this.transitionToMainWindow(profileId, profileResolver.mainWindowStatePath);
      return ok(null);
    });

    ipcMain.handle(WindowChannels.TRANSITION_TO_PROFILE_ACCESS, async (_event, input: unknown) => {
      const parsed = ProfileIdSchema.optional().safeParse(input);
      if (!parsed.success) return fail({ code: 'INVALID_REQUEST', message: 'Invalid Profile ID' });
      if (parsed.data && parsed.data === this.runtimeManager?.getActiveProfileId()) return ok(null);
      if (this.profileNavigationPending || this.isTransitioning)
        return fail({ code: 'WINDOW_TRANSITION_PENDING', message: 'Profile 切换正在进行' });
      this.profileNavigationPending = true;
      try {
        const autoOpen =
          parsed.data && this.runtimeManager && !(await this.runtimeManager.hasPin(parsed.data));
        await this.transitionToProfileAccessWindow(parsed.data, !autoOpen);
        if (autoOpen && parsed.data && this.runtimeManager) {
          try {
            const prepared = await this.runtimeManager.openProfile(parsed.data);
            await this.transitionToMainWindow(
              parsed.data,
              prepared.profileResolver.mainWindowStatePath,
            );
          } catch (error) {
            this.profileAccessWindow?.setEnabled(true);
            logger.warn('Target Profile could not open; Profile Access remains available', {
              error,
            });
          }
        }
        return ok(null);
      } finally {
        this.profileNavigationPending = false;
      }
    });

    // 获取当前窗口类型
    ipcMain.handle(WindowChannels.GET_TYPE, (event) => {
      const webContents = event.sender;
      if (this.profileAccessWindow?.webContents === webContents) {
        return ok('profile-access' as const);
      }
      if (this.mainWindow?.webContents === webContents) {
        return ok('main' as const);
      }
      return ok('unknown' as const);
    });

    ipcMain.handle(WindowChannels.FOCUS_MAIN_WINDOW, async () => ok(this.focusMainWindow()));

    ipcMain.handle(WindowChannels.SYNC_CHROME_THEME, (event, theme: DesktopChromeTheme) => {
      if (theme !== 'light' && theme !== 'dark') {
        throw new Error(`Invalid chrome theme: ${String(theme)}`);
      }

      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window || window.isDestroyed()) {
        return fail({ code: 'UNAVAILABLE', message: 'Window is not available' });
      }

      applyWindowChromeTheme(window, theme);
      return ok(null);
    });

    ipcMain.handle(WindowChannels.MINIMIZE, (event) => {
      const window = this.getWindowForSender(event.sender.id);
      if (!window || window.isDestroyed() || !window.isMinimizable()) {
        return fail({ code: 'UNAVAILABLE', message: 'Window cannot be minimized' });
      }

      window.minimize();
      return ok(null);
    });

    ipcMain.handle(WindowChannels.TOGGLE_MAXIMIZE, (event) => {
      const window = this.getWindowForSender(event.sender.id);
      if (!window || window.isDestroyed()) {
        return ok(null);
      }

      if (!window.isMaximizable() && !window.isFullScreen()) {
        return ok(this.getWindowControlsState(window));
      }

      if (window.isFullScreen()) {
        window.setFullScreen(false);
      } else if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }

      return ok(this.getWindowControlsState(window));
    });

    ipcMain.handle(WindowChannels.CLOSE, (event) => {
      const window = this.getWindowForSender(event.sender.id);
      if (!window || window.isDestroyed() || !window.isClosable()) {
        return fail({ code: 'UNAVAILABLE', message: 'Window cannot be closed' });
      }

      window.close();
      return ok(null);
    });

    ipcMain.handle(WindowChannels.GET_CONTROLS_STATE, (event) => {
      const window = this.getWindowForSender(event.sender.id);
      if (!window || window.isDestroyed()) {
        return ok(null);
      }

      return ok(this.getWindowControlsState(window));
    });
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    logger.info('Cleaning up WindowManager');

    if (this.profileAccessWindow && !this.profileAccessWindow.isDestroyed()) {
      this.profileAccessWindow.close();
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.close();
    }
    this.profileAccessWindow = null;
    this.mainWindow = null;
    this.profileAccessWindowStateManager = null;
    this.mainWindowStateManager = null;
  }

  private getShellPartition(): string {
    return 'persist:desktop-shell';
  }

  private getProfilePartition(profileId: string): string {
    return `persist:profile-${profileId}`;
  }
}
