import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import type { ElectronApplication } from 'playwright';

async function launchDesktop(
  userDataPath: string,
  userFilesPath: string,
  apiOrigin?: string,
): Promise<ElectronApplication> {
  const mainEntry = path.resolve('dist-electron/main.cjs');
  const args = ['--disable-gpu', '--disable-dev-shm-usage'];
  if (process.platform === 'linux' && process.env.MEMOFLOW_E2E_USE_GNOME_KEYRING === '1') {
    args.push('-r', path.resolve('e2e/support/real-keyring-playwright-loader.cjs'));
  }
  args.push(mainEntry);
  const electronApp = await electron.launch({
    args,
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      MEMOFLOW_DESKTOP_USER_DATA_PATH: userDataPath,
      MEMOFLOW_DESKTOP_USER_FILES_PATH: userFilesPath,
      ...(apiOrigin ? { MEMOFLOW_API_URL: `${apiOrigin}/api/v1` } : {}),
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
  });
  electronApp.on('console', (message) => {
    console.log(`[electron-main:${message.type()}] ${message.text()}`);
  });

  if (process.platform === 'linux') {
    const storage = await electronApp.evaluate(({ app, safeStorage }) => ({
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      backend: safeStorage.getSelectedStorageBackend(),
      passwordStore: app.commandLine.getSwitchValue('password-store'),
      hasDbusSession: Boolean(process.env.DBUS_SESSION_BUS_ADDRESS),
      hasKeyringControl: Boolean(process.env.GNOME_KEYRING_CONTROL),
    }));
    if (!storage.encryptionAvailable || storage.backend === 'basic_text' || storage.backend === 'unknown') {
      throw new Error(
        `Electron E2E requires a real Linux Secret Service/keyring; backend=${storage.backend}, available=${storage.encryptionAvailable}, passwordStore=${storage.passwordStore || 'unset'}, dbus=${storage.hasDbusSession}, keyring=${storage.hasKeyringControl}`,
      );
    }
  }

  return electronApp;
}

interface ProfileRegistryFile {
  activeProfileId: string | null;
  profiles: Array<{
    profileId: string;
    profileKind: 'guest' | 'registered';
    localOwnerId: string;
    cloudBinding: { cloudAccountId: string } | null;
  }>;
}

const CLOUD_IDENTITY_ID = 'IdentityId_00000000-0000-4000-8000-0000000000e2';

async function startCloudAuthFixture(): Promise<{
  origin: string;
  requests: string[];
  close(): Promise<void>;
}> {
  const requests: string[] = [];
  let tokenPolls = 0;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    requests.push(`${request.method ?? 'GET'} ${url.pathname}`);
    for await (const _chunk of request) {
      // Drain request bodies so the fixture can reuse keep-alive connections.
    }

    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };

    if (request.method === 'POST' && url.pathname === '/api/auth/device/code') {
      send(200, {
        device_code: 'main-process-only-device-secret',
        user_code: 'E2E01234',
        verification_uri_complete: `${origin}/auth/device?user_code=E2E01234`,
        expires_in: 600,
        interval: 1,
      });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/device/token') {
      tokenPolls += 1;
      if (tokenPolls === 1) {
        send(400, { error: 'authorization_pending' });
      } else {
        send(200, {
          access_token: 'desktop-e2e-bearer',
          token_type: 'Bearer',
          expires_in: 604_800,
        });
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/get-session') {
      send(200, {
        user: {
          id: CLOUD_IDENTITY_ID,
          email: 'github-e2e@example.com',
          name: 'GitHub E2E User',
          emailVerified: true,
        },
        session: { id: 'github-session-e2e', expiresAt: '2030-01-01T00:00:00.000Z' },
      });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/accounts/me') {
      send(200, {
        ok: true,
        data: {
          id: CLOUD_IDENTITY_ID,
          email: 'github-e2e@example.com',
          profile: { nickname: 'Existing Cloud User', avatarUrl: null, bio: null },
        },
      });
      return;
    }
    if (request.method === 'PUT' && url.pathname === '/api/v1/accounts/me') {
      send(200, { ok: true, data: { id: CLOUD_IDENTITY_ID } });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/powersync/token') {
      send(200, {
        ok: true,
        data: { token: 'powersync-e2e-token', endpoint: `${origin}/powersync`, expiresIn: 60 },
      });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/powersync/crud') {
      send(200, { ok: true });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/api/auth/sign-out') {
      send(200, { success: true });
      return;
    }
    send(404, { error: 'not_found' });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function readRegistry(userDataPath: string): ProfileRegistryFile {
  return JSON.parse(fs.readFileSync(
    path.join(userDataPath, 'shared', 'profiles', 'registry.json'),
    'utf8',
  )) as ProfileRegistryFile;
}

function captureRendererConsole(page: Page): void {
  page.on('console', (message) => {
    console.log(`[electron-renderer:${message.type()}] ${message.text()}`);
  });
}

test('persistent guest works offline, survives lock, and reopens with edited profile data', async () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-desktop-e2e-'));
  const userDataPath = path.join(runtimeRoot, 'user-data');
  const userFilesPath = path.join(runtimeRoot, 'user-files');
  let electronApp: ElectronApplication | null = null;

  try {
    electronApp = await launchDesktop(userDataPath, userFilesPath);
    const mainWindow = await electronApp.firstWindow();
    captureRendererConsole(mainWindow);
    await expect(mainWindow.getByTestId('app-shell')).toBeVisible();
    await expect(mainWindow.getByTestId('shell-account-name')).toHaveText(/^访客 \d{4}$/);

    await mainWindow.getByTestId('shell-account-menu').click();
    await mainWindow.getByTestId('shell-open-account').click();
    await expect(mainWindow.getByTestId('account-center-view')).toBeVisible();
    await mainWindow.getByTestId('account-profile-nickname').fill('离线旅程用户');
    await mainWindow.getByTestId('account-profile-save').click();
    await expect(mainWindow.getByText('个人资料已更新', { exact: true })).toBeVisible();
    await mainWindow.getByTestId('settings-return-to-app').click();
    await expect(mainWindow.getByTestId('shell-account-name')).toHaveText('离线旅程用户');
    await mainWindow.getByTestId('shell-account-menu').click();
    await mainWindow.getByTestId('shell-open-account').click();
    await expect(mainWindow.getByTestId('account-lock-profile-button')).toBeVisible();

    const profilePickerPromise = electronApp.waitForEvent('window', {
      predicate: async (window) => {
        try {
          await window.getByTestId('desktop-profile-access').waitFor({
            state: 'visible',
            timeout: 45_000,
          });
          return true;
        } catch {
          return false;
        }
      },
      timeout: 60_000,
    });
    await mainWindow.getByTestId('account-lock-profile-button').click();

    const profilePicker = await profilePickerPromise;
    captureRendererConsole(profilePicker);
    const profileButton = profilePicker.locator('[data-testid^="desktop-profile-open-"]');
    await expect(profileButton).toContainText('离线旅程用户');

    const reopenedMainWindowPromise = electronApp.waitForEvent('window', {
      predicate: async (window) => {
        try {
          await window.getByTestId('app-shell').waitFor({ state: 'visible', timeout: 45_000 });
          return true;
        } catch {
          return false;
        }
      },
      timeout: 60_000,
    });
    await profileButton.click();
    const reopenedMainWindow = await reopenedMainWindowPromise;
    await expect(reopenedMainWindow.getByTestId('shell-account-name')).toHaveText('离线旅程用户');
    const profileDirectories = fs.readdirSync(path.join(userDataPath, 'profiles'), {
      withFileTypes: true,
    }).filter((entry) => entry.isDirectory() && entry.name.startsWith('p_'));
    expect(profileDirectories).toHaveLength(1);

    await electronApp.close();
    electronApp = await launchDesktop(userDataPath, userFilesPath);
    const restartedMainWindow = await electronApp.firstWindow();
    captureRendererConsole(restartedMainWindow);
    await expect(restartedMainWindow.getByTestId('app-shell')).toBeVisible();
    await expect(restartedMainWindow.getByTestId('shell-account-name')).toHaveText('离线旅程用户');
  } finally {
    await electronApp?.close();
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('GitHub device authorization adopts the guest in place and cloud outage does not block reopen', async () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-github-e2e-'));
  const userDataPath = path.join(runtimeRoot, 'user-data');
  const userFilesPath = path.join(runtimeRoot, 'user-files');
  const cloud = await startCloudAuthFixture();
  let electronApp: ElectronApplication | null = null;

  try {
    electronApp = await launchDesktop(userDataPath, userFilesPath, cloud.origin);
    await electronApp.evaluate(({ shell }) => {
      Object.defineProperty(shell, 'openExternal', {
        configurable: true,
        value: async () => undefined,
      });
    });
    const mainWindow = await electronApp.firstWindow();
    captureRendererConsole(mainWindow);
    await expect(mainWindow.getByTestId('app-shell')).toBeVisible();

    const before = readRegistry(userDataPath);
    const profileBefore = before.profiles.find((profile) => profile.profileId === before.activeProfileId);
    expect(profileBefore?.profileKind).toBe('guest');
    const profileId = profileBefore?.profileId;
    expect(profileId).toBeTruthy();
    const profilePath = path.join(userDataPath, 'profiles', profileId!);
    const vaultMarker = path.join(profilePath, 'storage', 'obsidian-vault', 'e2e-marker.md');
    fs.mkdirSync(path.dirname(vaultMarker), { recursive: true });
    fs.writeFileSync(vaultMarker, 'local data survives cloud binding', 'utf8');

    await mainWindow.getByTestId('shell-account-menu').click();
    const initialWindowCount = electronApp.windows().length;
    await mainWindow.getByTestId('shell-open-cloud-connection').click();
    await expect(mainWindow.getByTestId('cloud-connection-dialog')).toBeVisible();
    await mainWindow.getByTestId('cloud-connection-continue').click();
    const pending = mainWindow.getByTestId('cloud-connection-pending');
    await expect(pending).toContainText('E2E01234');
    const attemptId = await pending.getAttribute('data-attempt-id');
    expect(attemptId).toBeTruthy();
    await expect.poll(() => cloud.requests).toEqual(expect.arrayContaining([
      'POST /api/auth/device/code',
      'POST /api/auth/device/token',
      'GET /api/auth/get-session',
      'GET /api/v1/accounts/me',
    ]));
    await expect.poll(async () => {
      const result = await mainWindow.evaluate(async ({ id }) => {
      const desktopWindow = window as Window & {
        electronAPI: { invoke(channel: string, ...args: unknown[]): Promise<unknown> };
      };
      return desktopWindow.electronAPI.invoke('cloud-auth:connection:status', { attemptId: id });
      }, { id: attemptId! }) as {
        ok: boolean;
        data?: { status: string; error: { code: string; message: string } | null };
        error?: { code: string; message: string };
      };
      return result.ok
        ? { status: result.data?.status, error: result.data?.error }
        : { status: 'ipc_failed', error: result.error };
    }).toEqual({ status: 'connected', error: null });
    await expect.poll(() => {
      const registry = readRegistry(userDataPath);
      return registry.profiles.find((profile) => profile.profileId === registry.activeProfileId);
    }).toMatchObject({
      profileId,
      profileKind: 'registered',
      localOwnerId: CLOUD_IDENTITY_ID,
      cloudBinding: { cloudAccountId: CLOUD_IDENTITY_ID },
    });
    await expect(mainWindow.getByTestId('app-shell')).toBeVisible({ timeout: 30_000 });
    await expect(mainWindow.getByTestId('cloud-connection-status')).toHaveText('已连接云端账号');
    expect(electronApp.windows()).toHaveLength(initialWindowCount);

    const after = readRegistry(userDataPath);
    const profileAfter = after.profiles.find((profile) => profile.profileId === after.activeProfileId);
    expect(profileAfter).toMatchObject({
      profileId,
      profileKind: 'registered',
      localOwnerId: CLOUD_IDENTITY_ID,
      cloudBinding: { cloudAccountId: CLOUD_IDENTITY_ID },
    });
    expect(fs.readFileSync(vaultMarker, 'utf8')).toBe('local data survives cloud binding');
    expect(fs.existsSync(path.join(
      userDataPath,
      'shared',
      'secure',
      'cloud-sessions',
      `${profileId}.bin`,
    ))).toBe(true);

    await mainWindow
      .getByTestId('cloud-connection-dialog')
      .getByRole('button', { name: '关闭' })
      .click();
    await mainWindow.getByTestId('shell-account-menu').click();
    await mainWindow.getByText('退出登录', { exact: true }).click();
    await expect(mainWindow.getByTestId('shell-open-cloud-connection')).toBeVisible();
    await mainWindow.getByTestId('shell-account-menu').click();
    await mainWindow.getByTestId('shell-open-cloud-connection').click();
    await mainWindow.getByTestId('cloud-connection-continue').click();
    const reauthPending = mainWindow.getByTestId('cloud-connection-pending');
    const reauthAttemptId = await reauthPending.getAttribute('data-attempt-id');
    expect(reauthAttemptId).toBeTruthy();
    await expect.poll(async () => {
      const result = await mainWindow.evaluate(async ({ id }) => {
        const desktopWindow = window as Window & {
          electronAPI: { invoke(channel: string, ...args: unknown[]): Promise<unknown> };
        };
        return desktopWindow.electronAPI.invoke('cloud-auth:connection:status', {
          attemptId: id,
        });
      }, { id: reauthAttemptId! }) as { ok: boolean; data?: { status: string } };
      return result.ok ? result.data?.status : 'ipc_failed';
    }).toBe('connected');
    expect(cloud.requests.filter((entry) => entry === 'POST /api/auth/device/code')).toHaveLength(2);
    expect(readRegistry(userDataPath).profiles).toContainEqual(expect.objectContaining({
      profileId,
      profileKind: 'registered',
      localOwnerId: CLOUD_IDENTITY_ID,
      cloudBinding: expect.objectContaining({ cloudAccountId: CLOUD_IDENTITY_ID }),
    }));
    expect(fs.readFileSync(vaultMarker, 'utf8')).toBe('local data survives cloud binding');

    await electronApp.close();
    electronApp = null;
    await cloud.close();

    electronApp = await launchDesktop(userDataPath, userFilesPath, cloud.origin);
    const offlineWindow = await electronApp.firstWindow();
    captureRendererConsole(offlineWindow);
    await expect(offlineWindow.getByTestId('app-shell')).toBeVisible({ timeout: 45_000 });
    expect(readRegistry(userDataPath).activeProfileId).toBe(profileId);
    expect(fs.readFileSync(vaultMarker, 'utf8')).toBe('local data survives cloud binding');
  } finally {
    await electronApp?.close();
    await cloud.close().catch(() => undefined);
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});
