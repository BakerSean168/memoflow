import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';

function appendLog(logs: string[], source: string, value: unknown): void {
  logs.push(`[${source}] ${typeof value === 'string' ? value : String(value)}`);
}

function readRuntimeLogs(userDataPath: string): string[] {
  const logDir = path.join(userDataPath, 'logs');
  if (!fs.existsSync(logDir)) return [];
  return fs
    .readdirSync(logDir)
    .filter((name) => name.endsWith('.log'))
    .sort()
    .flatMap((name) => {
      try {
        const content = fs.readFileSync(path.join(logDir, name), 'utf8');
        return [`[file:user-data/logs/${name}]\n${content.slice(-32_000)}`];
      } catch (error) {
        return [`[file-error:${name}] ${String(error)}`];
      }
    });
}

const executablePath = process.env.MEMOFLOW_PACKAGED_EXECUTABLE;

const ROUTE_READY_TIMEOUT_MS = 45_000;
const SETTINGS_READY_TIMEOUT_MS = 45_000;
const CLOSE_GRACE_MS = 10_000;

async function closeElectronApp(app: ElectronApplication, logs: string[]): Promise<unknown | null> {
  const child = app.process();
  let closeFailure: unknown = null;
  const closeResult = await Promise.race([
    app
      .close()
      .then(() => 'closed' as const)
      .catch((error: unknown) => {
        closeFailure = error;
        return 'failed' as const;
      }),
    delay(CLOSE_GRACE_MS).then(() => 'timeout' as const),
  ]);

  if (closeResult === 'closed') return null;
  if (closeResult === 'failed') return closeFailure;

  appendLog(
    logs,
    'close-timeout',
    `Electron did not close within ${CLOSE_GRACE_MS}ms; forcing process termination`,
  );
  child.kill('SIGKILL');
  return new Error(`packaged Electron close exceeded ${CLOSE_GRACE_MS}ms`);
}

test('packaged MemoFlow boots through renderer readiness', async ({}, testInfo) => {
  expect(
    executablePath,
    'MEMOFLOW_PACKAGED_EXECUTABLE must point to a packaged executable',
  ).toBeTruthy();
  expect(
    fs.existsSync(executablePath!),
    `packaged executable does not exist: ${executablePath}`,
  ).toBe(true);

  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-packaged-smoke-'));
  const userDataPath = path.join(runtimeRoot, 'user-data');
  const userFilesPath = path.join(runtimeRoot, 'user-files');
  const logs: string[] = [];
  const rendererPageErrors: string[] = [];
  let electronApp: ElectronApplication | null = null;
  let testFailure: unknown = null;
  let closeFailure: unknown = null;

  try {
    const args = ['--disable-gpu', '--disable-dev-shm-usage'];
    if (process.platform === 'linux') {
      // `electron-builder --dir` produces an unpacked tree owned by the CI user,
      // so chrome-sandbox cannot have the root:root / 4755 permissions it gets
      // after a real package install. Disable Chromium's SUID sandbox only for
      // this headless unpacked-package smoke; installed artifacts keep their
      // normal sandbox behavior.
      args.push('--no-sandbox');
      if (process.env.MEMOFLOW_PACKAGED_USE_GNOME_KEYRING === '1') {
        args.push('--password-store=gnome-libsecret');
      }
    }

    electronApp = await electron.launch({
      executablePath,
      args,
      env: {
        ...process.env,
        MEMOFLOW_DESKTOP_USER_DATA_PATH: userDataPath,
        MEMOFLOW_DESKTOP_USER_FILES_PATH: userFilesPath,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });
    electronApp.on('console', (message) =>
      appendLog(logs, `main:${message.type()}`, message.text()),
    );
    electronApp
      .process()
      .stdout?.on('data', (chunk) => appendLog(logs, 'stdout', chunk.toString()));
    electronApp
      .process()
      .stderr?.on('data', (chunk) => appendLog(logs, 'stderr', chunk.toString()));

    const mainWindow = await electronApp.firstWindow({ timeout: 45_000 });
    mainWindow.on('console', (message) =>
      appendLog(logs, `renderer:${message.type()}`, message.text()),
    );
    mainWindow.on('pageerror', (error) => {
      rendererPageErrors.push(error.message);
      appendLog(logs, 'renderer:pageerror', error.stack ?? error.message);
    });

    await expect(mainWindow.getByTestId('app-shell')).toBeVisible({ timeout: 45_000 });

    const windowHeader = mainWindow.getByTestId('window-header');
    await expect(windowHeader).toBeVisible();
    const headerAppRegion = await windowHeader.evaluate((element) =>
      getComputedStyle(element).getPropertyValue('-webkit-app-region').trim(),
    );
    expect(headerAppRegion, 'packaged Desktop titlebar must remain a native drag region').toBe(
      'drag',
    );

    const rightPanelToggle = mainWindow.getByTestId('shell-right-panel-toggle');
    await expect(rightPanelToggle).toBeVisible();
    const controlAppRegion = await rightPanelToggle.evaluate((element) =>
      getComputedStyle(element).getPropertyValue('-webkit-app-region').trim(),
    );
    expect(controlAppRegion, 'interactive titlebar controls must opt out of native dragging').toBe(
      'no-drag',
    );

    // Chromium delivers ResizeObserver loop protection through the global error
    // event even though it is not an uncaught application exception. Exercise the
    // packaged listener directly so release gates prove this browser notification
    // cannot replace the live renderer with the fatal startup fallback.
    const resizeObserverNotificationPrevented = await mainWindow.evaluate(() =>
      window.dispatchEvent(
        new ErrorEvent('error', {
          cancelable: true,
          message: 'ResizeObserver loop completed with undelivered notifications.',
        }),
      ),
    );
    expect(
      resizeObserverNotificationPrevented,
      'known ResizeObserver loop notification must be handled with preventDefault',
    ).toBe(false);
    await expect(mainWindow.getByTestId('app-shell')).toBeVisible();
    await expect(mainWindow.getByText('Desktop renderer failed')).toHaveCount(0);

    // Shared account settings must only mount password management when the host
    // provides the full CloudAuthClientPort (AUTH_SERVICE_KEY). Desktop exposes
    // a narrower session/device-auth port and must degrade without crashing.
    // Menu navigation is already exercised by desktop-auth-flow.spec.ts. The
    // packaged gate should isolate the production route/component contract so
    // dropdown timing differences cannot hide or mimic an AuthService DI crash.
    await mainWindow.evaluate(() => {
      window.location.hash = '#/settings?tab=account';
    });
    await expect(mainWindow).toHaveURL(/#\/settings\?tab=account$/);
    // The raw hash mutates before Vue Router has resolved the lazy settings route.
    // Gate on AppShell's router-derived scene contract rather than treating the URL
    // mutation itself as navigation completion. Cold packaged runners can spend
    // materially longer loading the first settings chunk than dev/browser builds.
    await expect(mainWindow.getByTestId('app-shell')).toHaveAttribute(
      'data-shell-scene',
      'settings',
      { timeout: ROUTE_READY_TIMEOUT_MS },
    );
    await expect(mainWindow.getByTestId('standalone-settings-layout')).toBeVisible({
      timeout: 10_000,
    });
    // The named lazy view and the account section mount separately from routing.
    await expect(mainWindow.getByTestId('user-settings-view')).toBeVisible({
      timeout: ROUTE_READY_TIMEOUT_MS,
    });
    await expect(mainWindow.getByTestId('settings-content-scroll')).toBeVisible({
      timeout: SETTINGS_READY_TIMEOUT_MS,
    });
    await expect(mainWindow.getByTestId('account-center-view')).toBeVisible({ timeout: 10_000 });
    expect(
      rendererPageErrors.filter((message) => message.includes('Missing injection: AuthService')),
      'Desktop account/privacy settings must not mount Web-only password auth without the capability',
    ).toEqual([]);
  } catch (error) {
    testFailure = error;
    appendLog(logs, 'smoke-error', error instanceof Error ? (error.stack ?? error.message) : error);
    throw error;
  } finally {
    logs.push(...readRuntimeLogs(userDataPath));
    if (electronApp) {
      closeFailure = await closeElectronApp(electronApp, logs);
      if (closeFailure) {
        appendLog(
          logs,
          'close-error',
          closeFailure instanceof Error
            ? (closeFailure.stack ?? closeFailure.message)
            : closeFailure,
        );
      }
    }
    await testInfo.attach('packaged-runtime.log', {
      body: Buffer.from(`${logs.join('\n')}\n`, 'utf8'),
      contentType: 'text/plain',
    });
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }

  if (!testFailure && closeFailure) throw closeFailure;
});
