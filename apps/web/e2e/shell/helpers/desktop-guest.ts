import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web/e2e/shell/helpers -> repo root (5 levels)
const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
const desktopMainEntrypoint = path.join(
  workspaceRoot,
  'apps',
  'desktop',
  'dist-electron',
  'main.cjs',
);

export interface DesktopWindowSize {
  width: number;
  height: number;
}

/**
 * Guest-mode Electron shell controller for UI geometry smoke.
 * Intentionally decoupled from sync credentials / API login.
 */
export class DesktopGuestShellController {
  private electronApp: ElectronApplication | null = null;
  private currentWindow: Page | null = null;
  private readonly userDataDir: string;

  constructor(userDataDir: string) {
    this.userDataDir = userDataDir;
  }

  get page(): Page {
    if (!this.currentWindow) {
      throw new Error('Desktop window is not ready.');
    }
    return this.currentWindow;
  }

  get app(): ElectronApplication {
    if (!this.electronApp) {
      throw new Error('Electron app is not launched.');
    }
    return this.electronApp;
  }

  async launch(size: DesktopWindowSize = { width: 1200, height: 800 }): Promise<Page> {
    if (!existsSync(desktopMainEntrypoint)) {
      throw new Error(
        `Desktop entrypoint not found at ${desktopMainEntrypoint}. Build desktop first.`,
      );
    }

    mkdirSync(this.userDataDir, { recursive: true });

    this.electronApp = await electron.launch({
      args: [
        path.join(__dirname, 'ephemeral-safe-storage.cjs'),
        // Stability flags for headless CI / agent Windows hosts.
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
      env: {
        ...process.env,
        MEMOFLOW_DESKTOP_USER_DATA_PATH: this.userDataDir,
        MEMOFLOW_SHELL_EPHEMERAL_STORAGE: '1',
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        VITEST: 'true',
      },
    });

    const first = await this.electronApp.firstWindow({ timeout: 30_000 });
    await first.waitForLoadState('domcontentloaded');
    this.currentWindow = first;
    await this.setWindowSize(size);
    return first;
  }

  async enterGuestAndWaitForShell(timeoutMs = 45_000): Promise<Page> {
    if (!this.electronApp) {
      throw new Error('Electron app has not been launched.');
    }

    const loginWindow = this.currentWindow ?? (await this.electronApp.firstWindow());
    await loginWindow.waitForLoadState('domcontentloaded');

    // Prefer explicit guest testid; fall back to localized button text.
    const guestButton = loginWindow.getByTestId('guest-mode-button');
    if ((await guestButton.count()) > 0) {
      await expect(guestButton).toBeVisible({ timeout: 15_000 });
      await guestButton.click();
    } else {
      await loginWindow.getByRole('button', { name: /访客模式|Guest/i }).click();
    }

    await expect
      .poll(
        async () => {
          const main = await this.findMainWindow();
          if (!main) return 'waiting';
          try {
            if ((await main.getByTestId('app-shell').count()) > 0) return 'ready';
          } catch {
            // Window may be mid-transition.
          }
          return 'waiting';
        },
        { timeout: timeoutMs, message: 'Timed out waiting for guest main window.' },
      )
      .toBe('ready');

    const main = await this.findMainWindow();
    if (!main) {
      throw new Error('Guest main window never became available.');
    }

    await main.waitForLoadState('domcontentloaded');
    await expect(main.getByTestId('app-shell')).toBeVisible({ timeout: timeoutMs });
    await expect(main.getByTestId('ai-chat-view')).toBeVisible({ timeout: timeoutMs });
    this.currentWindow = main;
    return main;
  }

  async setWindowSize(size: DesktopWindowSize): Promise<void> {
    if (!this.electronApp) {
      throw new Error('Electron app has not been launched.');
    }

    await this.electronApp.evaluate(async ({ BrowserWindow }, payload) => {
      const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
      // Prefer a non-auth/main content window when multiple exist.
      const win =
        windows.find((w) => {
          const url = w.webContents.getURL();
          return url.length > 0 && !url.includes('#/auth');
        }) ??
        BrowserWindow.getFocusedWindow() ??
        windows[0] ??
        null;
      if (!win) {
        throw new Error('No BrowserWindow available to resize.');
      }
      win.setContentSize(payload.width, payload.height);
    }, size);

    if (this.currentWindow) {
      await this.currentWindow.waitForTimeout(250);
    }
  }

  async close(): Promise<void> {
    if (this.electronApp) {
      try {
        await this.electronApp.close();
      } catch {
        // Best-effort shutdown for crashed Electron instances.
      }
      this.electronApp = null;
      this.currentWindow = null;
    }
    rmSync(this.userDataDir, { recursive: true, force: true });
  }

  private async findMainWindow(): Promise<Page | null> {
    if (!this.electronApp) return null;
    for (const page of this.electronApp.windows()) {
      try {
        if (!(await this.isLoginWindow(page))) {
          return page;
        }
      } catch {
        // Skip pages that closed during inspection.
      }
    }
    return null;
  }

  private async isLoginWindow(page: Page): Promise<boolean> {
    if (page.isClosed()) return true;
    const url = page.url();
    if (url.includes('#/auth')) return true;
    if ((await page.getByTestId('login-submit-button').count()) > 0) return true;
    if (
      (await page.getByTestId('guest-mode-button').count()) > 0 &&
      (await page.getByTestId('app-shell').count()) === 0
    ) {
      return true;
    }
    return false;
  }
}

export async function boxOf(
  page: Page,
  testId: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const locator = page.getByTestId(testId);
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`No bounding box for data-testid="${testId}"`);
  }
  return box;
}

export function containsBox(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
  tolerance = 2,
): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}
