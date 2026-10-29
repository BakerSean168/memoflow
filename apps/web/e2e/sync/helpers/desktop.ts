import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
const desktopMainEntrypoint = path.join(
  workspaceRoot,
  'apps',
  'desktop',
  'dist-electron',
  'main.cjs',
);
// better-auth renders the device user code as two groups of four characters.
const DEVICE_USER_CODE_PATTERN = /[A-Z0-9]{4}-?[A-Z0-9]{4}/;

interface ProfileRegistrySnapshot {
  activeProfileId: string | null;
  profiles: Array<{
    profileId: string;
    profileKind: 'guest' | 'registered';
    cloudBinding: { cloudAccountId: string } | null;
  }>;
}

async function readDeviceUserCode(pending: Locator): Promise<string> {
  const text = await pending.innerText();
  const match = text.match(DEVICE_USER_CODE_PATTERN);
  if (!match) {
    throw new Error(
      `Desktop device authorization dialog did not expose a user code: ${JSON.stringify(text)}`,
    );
  }

  return match[0];
}

export class DesktopAppController {
  private electronApp: ElectronApplication | null = null;
  private currentWindow: Page | null = null;

  constructor(
    private readonly userDataDir: string,
    private readonly apiBaseUrl: string,
  ) {}

  get page(): Page {
    if (!this.currentWindow) {
      throw new Error('Desktop window is not ready.');
    }

    return this.currentWindow;
  }

  async launch(): Promise<Page> {
    if (!fs.existsSync(desktopMainEntrypoint)) {
      throw new Error(
        `Desktop entrypoint not found at ${desktopMainEntrypoint}. The sync global setup must build desktop first.`,
      );
    }

    // Each run gets an isolated user-data directory so sync assertions are not
    // polluted by a developer's local desktop session.
    fs.mkdirSync(this.userDataDir, { recursive: true });

    // Playwright's Electron launcher installs --password-store=basic, which the
    // keyring check below rejects on Linux. The desktop authentication lane
    // strips those test-only switches through this loader; the collector asks
    // for it the same way it asks for the real Secret Service.
    const launchArgs = [desktopMainEntrypoint];
    if (process.platform === 'linux' && process.env.MEMOFLOW_E2E_USE_GNOME_KEYRING === '1') {
      launchArgs.unshift(
        '-r',
        path.join(
          workspaceRoot,
          'apps',
          'desktop',
          'e2e',
          'support',
          'real-keyring-playwright-loader.cjs',
        ),
      );
    }

    this.electronApp = await electron.launch({
      args: launchArgs,
      env: {
        ...process.env,
        MEMOFLOW_API_URL: this.apiBaseUrl,
        MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: this.userDataDir,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        VITEST: 'true',
      },
    });

    if (process.platform === 'linux') {
      const storage = await this.electronApp.evaluate(({ safeStorage }) => ({
        encryptionAvailable: safeStorage.isEncryptionAvailable(),
        backend: safeStorage.getSelectedStorageBackend(),
      }));
      if (
        !storage.encryptionAvailable ||
        storage.backend === 'basic_text' ||
        storage.backend === 'unknown'
      ) {
        throw new Error(
          `Electron sync E2E requires a real Linux Secret Service/keyring; backend=${storage.backend}, available=${storage.encryptionAvailable}`,
        );
      }
    }

    this.currentWindow = await this.electronApp.firstWindow();
    await this.currentWindow.waitForLoadState('domcontentloaded');
    return this.currentWindow;
  }

  /**
   * Connects the desktop to the E2E cloud account through the product's own
   * device-authorization flow.
   *
   * The desktop deliberately boots into a guest Profile, and guest Profiles
   * never attach a PowerSync connector, so the lane has to create a registered
   * Profile the same way a user does: ask the desktop for a device code and
   * approve it in the already signed-in Web session.
   */
  async connectCloudProfile(approvalPage: Page): Promise<Page> {
    const app = this.electronApp;
    if (!app) {
      throw new Error('Electron app has not been launched.');
    }

    // The verification URL would otherwise be handed to the system browser,
    // which has no session and no display in the headless lane.
    await app.evaluate(({ shell }) => {
      Object.defineProperty(shell, 'openExternal', {
        configurable: true,
        value: async () => undefined,
      });
    });

    const guestWindow = await this.waitForMainWindow();
    await guestWindow.getByTestId('shell-account-menu').click();
    await guestWindow.getByTestId('shell-switch-account').click();
    await guestWindow.getByTestId('shell-manage-profiles').click();
    await expect(guestWindow.getByTestId('manage-accounts-dialog')).toBeVisible();

    await guestWindow.getByTestId('shell-add-account').click();
    await guestWindow.getByTestId('cloud-connection-continue').click();

    const pending = guestWindow.getByTestId('cloud-connection-pending');
    await expect(pending).toBeVisible({ timeout: 30_000 });
    const userCode = await readDeviceUserCode(pending);

    const approval = await approvalPage.context().newPage();
    try {
      const approvalOrigin = new URL(approvalPage.url()).origin;
      await approval.goto(
        `${approvalOrigin}/auth/device?user_code=${encodeURIComponent(userCode)}`,
        { waitUntil: 'domcontentloaded' },
      );
      await expect(approval.getByTestId('device-auth-approval')).toBeVisible({ timeout: 30_000 });
      await approval.getByTestId('device-auth-approve').click();
      await expect(approval.getByTestId('device-auth-approved')).toBeVisible({ timeout: 30_000 });
    } finally {
      await approval.close();
    }

    // Approving creates a separate registered Profile, so the Shell swaps the
    // guest window for a fresh one bound to the cloud account.
    const cloudWindow = await app.waitForEvent('window', {
      predicate: async (page) => {
        try {
          await page.getByTestId('app-shell').waitFor({ state: 'visible', timeout: 45_000 });
          return true;
        } catch {
          return false;
        }
      },
      timeout: 60_000,
    });
    await cloudWindow.waitForLoadState('domcontentloaded');
    this.currentWindow = cloudWindow;

    await expect
      .poll(() => this.activeProfileIsCloudBound(), {
        timeout: 30_000,
        message: 'Desktop never activated a cloud-bound Profile after device authorization.',
      })
      .toBe(true);

    return cloudWindow;
  }

  /** Relaunches the desktop and waits for the restored cloud-bound Profile. */
  async restart(): Promise<Page> {
    await this.close();
    await this.launch();

    const mainWindow = await this.waitForMainWindow();
    this.currentWindow = mainWindow;

    await expect
      .poll(() => this.activeProfileIsCloudBound(), {
        timeout: 30_000,
        message: 'Desktop did not restore a cloud-bound Profile after restart.',
      })
      .toBe(true);

    return mainWindow;
  }

  async setWindowSize(width: number, height: number): Promise<{ width: number; height: number }> {
    if (!this.electronApp) {
      throw new Error('Electron app has not been launched.');
    }

    return this.electronApp.evaluate(
      ({ BrowserWindow }, size) => {
        const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
        if (!window) throw new Error('Desktop main window is unavailable.');
        window.setBounds({ width: size.width, height: size.height });
        const bounds = window.getBounds();
        return { width: bounds.width, height: bounds.height };
      },
      { width, height },
    );
  }

  async setZoomFactor(factor: number): Promise<void> {
    if (!this.electronApp) {
      throw new Error('Electron app has not been launched.');
    }

    await this.electronApp.evaluate(({ BrowserWindow }, zoomFactor) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
      if (!window) throw new Error('Desktop main window is unavailable.');
      window.webContents.setZoomFactor(zoomFactor);
    }, factor);
  }

  async close(): Promise<void> {
    if (!this.electronApp) {
      return;
    }

    await this.electronApp.close();
    this.electronApp = null;
    this.currentWindow = null;
  }

  private activeProfileIsCloudBound(): boolean {
    const registry = this.readProfileRegistry();
    if (!registry) {
      return false;
    }

    const active = registry.profiles.find(
      (profile) => profile.profileId === registry.activeProfileId,
    );
    return Boolean(active?.cloudBinding);
  }

  private readProfileRegistry(): ProfileRegistrySnapshot | null {
    const registryPath = path.join(this.userDataDir, 'data', 'shared', 'profiles', 'registry.json');
    if (!fs.existsSync(registryPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(registryPath, 'utf8')) as ProfileRegistrySnapshot;
    } catch {
      return null;
    }
  }

  private async waitForMainWindow(): Promise<Page> {
    await expect
      .poll(
        async () => {
          const mainWindow = await this.findMainWindow();
          return mainWindow ? 'ready' : 'waiting';
        },
        { timeout: 30_000, message: 'Timed out waiting for the desktop main window.' },
      )
      .toBe('ready');

    const mainWindow = await this.findMainWindow();
    if (!mainWindow) {
      throw new Error('Desktop main window never became available.');
    }

    await mainWindow.waitForLoadState('domcontentloaded');
    return mainWindow;
  }

  private async findMainWindow(): Promise<Page | null> {
    if (!this.electronApp) {
      return null;
    }

    for (const page of this.electronApp.windows()) {
      if (page.isClosed()) {
        continue;
      }
      if (await this.isWorkspaceWindow(page)) {
        return page;
      }
    }

    return null;
  }

  /** The Shell's Profile Access window is a picker, not a workspace. */
  private async isWorkspaceWindow(page: Page): Promise<boolean> {
    return page
      .getByTestId('app-shell')
      .isVisible()
      .catch(() => false);
  }
}
