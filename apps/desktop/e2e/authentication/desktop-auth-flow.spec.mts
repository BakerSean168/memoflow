import {
  ProfileImportRequestSchema,
  type ProfileImportPlan,
  type ProfileImportCommitted,
} from '@memoflow/contracts/data-portability';
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
    if (
      !storage.encryptionAvailable ||
      storage.backend === 'basic_text' ||
      storage.backend === 'unknown'
    ) {
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

async function startCloudAuthFixture(
  handle?: (
    method: string,
    pathname: string,
    body: string,
  ) => { status: number; body: unknown } | null,
): Promise<{
  origin: string;
  requests: string[];
  setIdentity(id: string): void;
  close(): Promise<void>;
}> {
  const requests: string[] = [];
  let tokenPolls = 0;
  let authenticatedIdentityId = CLOUD_IDENTITY_ID;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    requests.push(`${request.method ?? 'GET'} ${url.pathname}`);
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString('utf8');

    const send = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };

    const handled = handle?.(request.method ?? 'GET', url.pathname, body);
    if (handled) {
      send(handled.status, handled.body);
      return;
    }

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
          access_token: `desktop-e2e-${authenticatedIdentityId}`,
          token_type: 'Bearer',
          expires_in: 604_800,
        });
      }
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/get-session') {
      send(200, {
        user: {
          id:
            request.headers.authorization?.replace('Bearer desktop-e2e-', '') ??
            authenticatedIdentityId,
          email: 'github-e2e@example.com',
          name: 'GitHub E2E User',
          emailVerified: true,
        },
        session: { id: 'github-session-e2e', expiresAt: '2030-01-01T00:00:00.000Z' },
      });
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
    setIdentity(id: string) {
      authenticatedIdentityId = id;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function readRegistry(userDataPath: string): ProfileRegistryFile {
  return JSON.parse(
    fs.readFileSync(path.join(userDataPath, 'shared', 'profiles', 'registry.json'), 'utf8'),
  ) as ProfileRegistryFile;
}

function appMainWindow(app: ElectronApplication): Page {
  const page = app
    .windows()
    .filter((window) => !window.isClosed() && !window.url().includes('profile-access'))
    .at(-1);
  if (!page) throw new Error('Main window is not available');
  return page;
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
    const localProfileName = await mainWindow.getByTestId('shell-account-name').innerText();
    expect(localProfileName).toMatch(/^访客 \d{4}$/);

    await mainWindow.getByTestId('shell-account-menu').click();
    await mainWindow.getByTestId('shell-open-account').click();
    await expect(mainWindow.getByTestId('account-center-view')).toBeVisible();
    await mainWindow.getByTestId('account-profile-nickname').fill('离线旅程用户');
    await mainWindow.getByTestId('account-profile-save').click();
    await expect(mainWindow.getByText('个人资料已更新', { exact: true })).toBeVisible();
    await mainWindow.getByTestId('settings-return-to-app').click();
    await expect(mainWindow.getByTestId('shell-account-name')).toHaveText(localProfileName);
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
    await expect(profileButton).toContainText(localProfileName);

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
    await expect(reopenedMainWindow.getByTestId('shell-account-name')).toHaveText(localProfileName);
    const profileDirectories = fs
      .readdirSync(path.join(userDataPath, 'profiles'), {
        withFileTypes: true,
      })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('p_'));
    expect(profileDirectories).toHaveLength(1);

    await electronApp.close();
    electronApp = await launchDesktop(userDataPath, userFilesPath);
    const restartedMainWindow = await electronApp.firstWindow();
    captureRendererConsole(restartedMainWindow);
    await expect(restartedMainWindow.getByTestId('app-shell')).toBeVisible();
    await expect(restartedMainWindow.getByTestId('shell-account-name')).toHaveText(
      localProfileName,
    );
  } finally {
    await electronApp?.close();
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('device authorization opens an independent cloud Profile and preserves the source guest', async () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-profiles-e2e-'));
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
    await expect(mainWindow.getByTestId('app-shell')).toBeVisible();
    const before = readRegistry(userDataPath);
    const source = before.profiles.find((profile) => profile.profileId === before.activeProfileId)!;
    const marker = path.join(userDataPath, 'profiles', source.profileId, 'source-marker.txt');
    fs.writeFileSync(marker, 'source remains independent');
    await mainWindow.getByTestId('shell-account-menu').click();
    await mainWindow.getByTestId('shell-add-account').click();
    await mainWindow.getByTestId('cloud-connection-continue').click();
    await expect.poll(() => readRegistry(userDataPath).profiles.length).toBe(2);
    const target = readRegistry(userDataPath).profiles.find(
      (profile) => profile.profileKind === 'registered',
    )!;
    expect(target.profileId).not.toBe(source.profileId);
    expect(target.localOwnerId).toBe(CLOUD_IDENTITY_ID);
    await expect.poll(() => readRegistry(userDataPath).activeProfileId).toBe(target.profileId);
    await expect.poll(() => mainWindow.isClosed()).toBe(true);
    expect(
      readRegistry(userDataPath).profiles.find((profile) => profile.profileId === source.profileId),
    ).toMatchObject(source);
    expect(fs.readFileSync(marker, 'utf8')).toBe('source remains independent');
    expect(
      fs.existsSync(
        path.join(userDataPath, 'shared', 'secure', 'cloud-sessions', `${source.profileId}.bin`),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(userDataPath, 'shared', 'secure', 'cloud-sessions', `${target.profileId}.bin`),
      ),
    ).toBe(true);
    expect(cloud.requests).not.toContain('PUT /api/v1/accounts/me');
    await expect
      .poll(async () => {
        const visible = await Promise.all(
          electronApp!
            .windows()
            .filter((page) => !page.isClosed())
            .map((page) =>
              page
                .getByTestId('app-shell')
                .isVisible()
                .catch(() => false),
            ),
        );
        return visible.some(Boolean);
      })
      .toBe(true);
    const cloudWindow = appMainWindow(electronApp);
    await expect(cloudWindow.getByTestId('app-shell')).toBeVisible();
    cloud.setIdentity('IdentityId_00000000-0000-4000-8000-0000000000e3');
    await cloudWindow.getByTestId('shell-account-menu').click();
    await cloudWindow.getByTestId('shell-add-account').click();
    await cloudWindow.getByTestId('cloud-connection-continue').click();
    await expect.poll(() => readRegistry(userDataPath).profiles.length).toBe(3);
    const another = readRegistry(userDataPath).profiles.find(
      (profile) => profile.profileId !== source.profileId && profile.profileId !== target.profileId,
    )!;
    await expect.poll(() => readRegistry(userDataPath).activeProfileId).toBe(another.profileId);
    expect(
      fs.existsSync(
        path.join(userDataPath, 'shared', 'secure', 'cloud-sessions', `${target.profileId}.bin`),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(userDataPath, 'shared', 'secure', 'cloud-sessions', `${another.profileId}.bin`),
      ),
    ).toBe(true);

    await electronApp.close();
    electronApp = null;
    await cloud.close();
    electronApp = await launchDesktop(userDataPath, userFilesPath, cloud.origin);
    const offlineWindow = await electronApp.firstWindow();
    await expect(offlineWindow.getByTestId('app-shell')).toBeVisible();
    expect(readRegistry(userDataPath).activeProfileId).toBe(another.profileId);
    expect(fs.readFileSync(marker, 'utf8')).toBe('source remains independent');
  } finally {
    await electronApp?.close();
    await cloud.close().catch(() => undefined);
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('a second guest keeps an independent Account and its PIN selection across restart', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-multi-guest-e2e-'));
  const userData = path.join(root, 'user-data');
  const userFiles = path.join(root, 'user-files');
  let app: ElectronApplication | null = null;
  try {
    app = await launchDesktop(userData, userFiles);
    const firstWindow = await app.firstWindow();
    await expect(firstWindow.getByTestId('app-shell')).toBeVisible();
    const first = readRegistry(userData).profiles[0]!;
    await firstWindow.getByTestId('shell-account-menu').click();
    const pickerPromise = app.waitForEvent('window');
    await firstWindow.getByTestId('shell-manage-profiles').click();
    const picker = await pickerPromise;
    await expect(picker.getByTestId('desktop-profile-access')).toBeVisible();
    await picker.getByTestId('desktop-profile-create').locator('input').fill('Work');
    const secondWindowPromise = app.waitForEvent('window');
    await picker.getByTestId('desktop-profile-create').getByRole('button').click();
    await expect.poll(() => readRegistry(userData).profiles.length).toBe(2);
    const second = readRegistry(userData).profiles.find(
      (profile) => profile.profileId !== first.profileId,
    )!;
    expect(second.localOwnerId).not.toBe(first.localOwnerId);
    const secondWindow = await secondWindowPromise;
    await expect(secondWindow.getByTestId('shell-account-name')).toHaveText('Work');
    const pinResult = await secondWindow.evaluate(async () => {
      const bridge = (
        window as Window & {
          electronAPI: { invoke(channel: string, ...args: unknown[]): Promise<unknown> };
        }
      ).electronAPI;
      return bridge.invoke('profile-access:pin-set', '123456');
    });
    expect(pinResult).toMatchObject({ ok: true });
    await app.close();
    app = await launchDesktop(userData, userFiles);
    const locked = await app.firstWindow();
    await expect(locked.getByTestId('desktop-profile-access')).toBeVisible();
    await locked.getByTestId(`desktop-profile-open-${second.profileId}`).click();
    const pin = locked.getByTestId(`desktop-profile-pin-${second.profileId}`);
    await pin.fill('000000');
    await pin.locator('..').getByRole('button').click();
    await expect(locked.getByText('PIN 不正确或解锁凭据已损坏', { exact: true })).toBeVisible();
    await pin.fill('123456');
    const unlockedPromise = app.waitForEvent('window');
    await pin.locator('..').getByRole('button').click();
    const unlocked = await unlockedPromise;
    await expect(unlocked.getByTestId('shell-account-name')).toHaveText('Work');
    expect(readRegistry(userData).activeProfileId).toBe(second.profileId);
    expect(
      readRegistry(userData).profiles.find((profile) => profile.profileId === first.profileId),
    ).toMatchObject(first);
  } finally {
    await app?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('guest copy preview persists across restart and waits for local content without repeating the cloud commit', async () => {
  // Inventory lists this suite before runtime libraries are built. Load the
  // fixture helper only when the E2E runs, after desktop:e2e builds its closure.
  const portabilityPackage = '@memoflow/data-portability';
  const { profileImportDigest }: typeof import('@memoflow/data-portability') =
    await import(portabilityPackage);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-copy-e2e-'));
  const userData = path.join(root, 'user-data');
  const userFiles = path.join(root, 'user-files');
  let plan: ProfileImportPlan | null = null;
  let committed: ProfileImportCommitted | null = null;
  let commitCount = 0;
  const cloud = await startCloudAuthFixture((method, pathname, body) => {
    if (pathname.endsWith('/accounts/me/data-summary'))
      return {
        status: 200,
        body: {
          ok: true,
          data: {
            schemaVersion: 1,
            state: 'empty',
            observedAt: new Date().toISOString(),
            owners: [
              'goal',
              'task',
              'label',
              'schedule',
              'routine',
              'repository',
              'ai',
              'notification',
              'relation',
            ].map((owner) => ({ owner, state: 'empty' })),
          },
        },
      };
    if (pathname.endsWith('/profile-import/preflight')) {
      const input = ProfileImportRequestSchema.parse(JSON.parse(body));
      const digest = profileImportDigest(JSON.parse(input.content));
      plan = {
        schemaVersion: 1,
        requestId: input.requestId,
        operationId: 'e2e-copy',
        batchId: 'e2e-copy',
        sourceDigest: digest,
        effectiveDigest: digest,
        blockers: [],
        preview: {
          batchId: 'e2e-copy',
          dryRun: true,
          capabilities: [
            { key: 'labels', schemaVersion: 3, created: 1, updated: 0, skipped: 0, warnings: [] },
          ],
          created: { labels: 1 },
          updated: {},
          skipped: {},
          warnings: [],
        },
      };
      return { status: 200, body: { ok: true, data: plan } };
    }
    if (pathname.endsWith('/profile-import/commit') && plan) {
      commitCount += 1;
      committed = {
        status: 'committed',
        plan,
        receipt: { ...plan.preview, dryRun: false },
        bindings: [{ ref: 'labels:1', targetKey: 'not-yet-synced-label' }],
        manifests: [
          {
            key: 'labels',
            schemaVersion: 3,
            digest: profileImportDigest({
              labels: [{ ref: 'labels:1', name: 'Copy E2E', color: null }],
            }),
          },
        ],
        serverVerified: true,
        committedAt: new Date().toISOString(),
      };
      return { status: 200, body: { ok: true, data: committed } };
    }
    if (method === 'GET' && pathname.includes('/profile-import/') && plan)
      return { status: 200, body: { ok: true, data: committed ?? { status: 'pending', plan } } };
    return null;
  });
  let app: ElectronApplication | null = null;
  try {
    app = await launchDesktop(userData, userFiles, cloud.origin);
    await app.evaluate(({ shell }) =>
      Object.defineProperty(shell, 'openExternal', {
        configurable: true,
        value: async () => undefined,
      }),
    );
    const guest = await app.firstWindow();
    await expect(guest.getByTestId('app-shell')).toBeVisible();
    const source = readRegistry(userData).profiles[0]!;
    const seeded = await guest.evaluate(async () => {
      const bridge = (
        window as Window & {
          electronAPI: { invoke(channel: string, input: unknown): Promise<unknown> };
        }
      ).electronAPI;
      return bridge.invoke('data-portability:apply', {
        content: JSON.stringify({
          format: 'memoflow.user-data-export',
          schemaVersion: 3,
          productVersion: 'e2e',
          exportedAt: '2026-10-09',
          capabilities: [
            {
              key: 'labels',
              schemaVersion: 3,
              payload: { labels: [{ ref: 'labels:1', name: 'Copy E2E', color: null }] },
            },
          ],
        }),
      });
    });
    expect(seeded).toMatchObject({ ok: true });
    await guest.getByTestId('shell-account-menu').click();
    await guest.getByTestId('shell-add-account').click();
    const targetWindowPromise = app.waitForEvent('window', {
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
    await guest.getByTestId('cloud-connection-continue').click();
    await expect.poll(() => readRegistry(userData).profiles.length).toBe(2);
    await expect.poll(() => guest.isClosed()).toBe(true);
    const targetWindow = await targetWindowPromise;
    const dialog = targetWindow.getByTestId('profile-import-dialog');
    await expect(dialog).toBeVisible({ timeout: 45_000 });
    await dialog.getByRole('button', { name: '预览导入', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '确认复制', exact: true })).toBeVisible();
    await expect(dialog.getByTestId('profile-import-delete-source')).not.toBeChecked();
    await dialog.getByRole('button', { name: '确认复制', exact: true }).click();
    await expect(dialog.getByText('已复制到云端，等待本机核验', { exact: true })).toBeVisible();
    expect(commitCount).toBe(1);
    expect(fs.existsSync(path.join(userData, 'profiles', source.profileId))).toBe(true);
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await app.close();
    app = await launchDesktop(userData, userFiles, cloud.origin);
    const restarted = await app.firstWindow();
    await expect(restarted.getByTestId('app-shell')).toBeVisible();
    await expect(restarted.getByTestId('profile-import-dialog')).not.toBeVisible();
    await restarted.getByTestId('shell-account-menu').click();
    await restarted.getByTestId('shell-import-profile').click();
    const recovered = restarted.getByTestId('profile-import-dialog');
    await recovered.locator('summary').click();
    await recovered.getByRole('button', { name: /已复制到云端，等待本机核验/ }).click();
    await recovered.getByRole('button', { name: '恢复并重新核验', exact: true }).click();
    await expect(recovered.getByText('已复制到云端，等待本机核验', { exact: true })).toBeVisible();
    expect(commitCount).toBe(1);
    expect(fs.existsSync(path.join(userData, 'profiles', source.profileId))).toBe(true);
  } finally {
    await app?.close();
    await cloud.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
