import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { NotificationChannels, RoutineChannels } from '@memoflow/desktop-contracts';
import type { NotificationClientDTO } from '@memoflow/notification-contracts';
import { enterLocalWorkspace } from './support/profile-access';

interface BridgeWindow {
  electronAPI: { invoke(channel: string, payload?: unknown): Promise<unknown> };
}

async function invoke<T>(page: Page, channel: string, payload?: unknown): Promise<T> {
  const result = (await page.evaluate(
    ({ channel, payload }) =>
      (window as unknown as BridgeWindow).electronAPI.invoke(channel, payload),
    { channel, payload },
  )) as { ok: boolean; data: T; error?: unknown };
  expect(result.ok, JSON.stringify(result.error)).toBe(true);
  return result.data;
}

async function launch(storageRoot: string): Promise<ElectronApplication> {
  const args = ['--disable-gpu', '--disable-dev-shm-usage'];
  if (process.platform === 'linux' && process.env.MEMOFLOW_E2E_USE_GNOME_KEYRING === '1') {
    args.push('-r', path.resolve('e2e/support/real-keyring-playwright-loader.cjs'));
  }
  args.push(path.resolve('dist-electron/main.cjs'));
  const app = await electron.launch({
    args,
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      // The isolated local Profile uses IPC even when the API is unavailable.
      MEMOFLOW_API_URL: 'http://127.0.0.1:59999/api/v1',
      MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: storageRoot,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
  });
  app.process().stdout?.on('data', (chunk) => console.log('[desktop]', String(chunk)));
  app.process().stderr?.on('data', (chunk) => console.log('[desktop-stderr]', String(chunk)));
  await app.firstWindow({ timeout: 45_000 });
  if (process.platform === 'linux') {
    const backend = await app.evaluate(({ safeStorage }) => ({
      available: safeStorage.isEncryptionAvailable(),
      name: safeStorage.getSelectedStorageBackend(),
    }));
    expect(backend.available).toBe(true);
    expect(['basic_text', 'unknown']).not.toContain(backend.name);
  }
  return app;
}

async function popup(app: ElectronApplication): Promise<Page> {
  await expect
    .poll(() => app.windows().some((page) => page.url().includes('/custom-notification')))
    .toBe(true);
  return app.windows().find((page) => page.url().includes('/custom-notification'))!;
}

async function attention(page: Page): Promise<number> {
  return (await invoke<{ count: number }>(page, NotificationChannels.GET_ATTENTION_COUNT)).count;
}

async function pending(page: Page): Promise<NotificationClientDTO[]> {
  return (
    await invoke<{ notifications: NotificationClientDTO[] }>(page, NotificationChannels.LIST, {
      needsAttention: true,
      page: 1,
      limit: 20,
    })
  ).notifications;
}

test('ordinary timeout and persistent Routine attention share canonical actions across windows and restart', async ({}, testInfo) => {
  test.setTimeout(250_000);
  const storageRoot = testInfo.outputPath('isolated-profile');
  let app = await launch(storageRoot);
  try {
    let main = await enterLocalWorkspace(app);
    await main.getByTestId('capsule-nav-notification').click();
    await expect(main.getByTestId('notification-center')).toBeVisible();

    const ordinary = await invoke<NotificationClientDTO>(main, NotificationChannels.CREATE, {
      workflowKey: 'system.general',
      title: 'Ordinary attention acceptance',
      content: 'Auto-dismiss must preserve unread attention.',
      type: 'Info',
      category: 'System',
      sendImmediately: true,
      channels: ['InApp', 'Desktop'],
    });
    let notice = await popup(app);
    await expect(notice.getByTestId('notification-open')).toContainText(
      'Ordinary attention acceptance',
    );
    // Exercise the real 30 second presentation timer, without replacing any product clock.
    await expect(notice.getByTestId('notification-open')).toHaveCount(0, { timeout: 36_000 });
    expect(
      (await invoke<NotificationClientDTO>(main, NotificationChannels.GET, ordinary.id)).isRead,
    ).toBe(false);
    expect(await attention(main)).toBe(1);
    await invoke(main, NotificationChannels.MARK_READ, ordinary.id);
    await expect.poll(() => attention(main)).toBe(0);

    await invoke(main, RoutineChannels.CREATE, {
      name: 'Attention acceptance break',
      description: 'Persistent elapsed timer and owner completion.',
      trigger: {
        type: 'Elapsed',
        timingOwner: 'scheduler',
        durationMs: 8_000,
        anchor: 'last-satisfied',
      },
      profileIds: [],
    });
    notice = await popup(app);
    await expect(notice.getByTestId('notification-open')).toContainText(
      'Attention acceptance break',
      { timeout: 30_000 },
    );
    await expect(notice.locator('[data-testid="notification-complete"]')).toBeVisible();
    await expect(notice.getByTestId('notification-elapsed')).toContainText(/00:3[1-9]/, {
      timeout: 36_000,
    });
    await expect(notice.getByTestId('notification-read')).toBeVisible();
    expect(await attention(main)).toBe(1);
    const first = (await pending(main))[0]!;
    await notice.screenshot({ path: testInfo.outputPath('routine-persistent-timer.png') });
    await testInfo.attach('routine-persistent-timer', {
      path: testInfo.outputPath('routine-persistent-timer.png'),
      contentType: 'image/png',
    });
    await notice.getByTestId('notification-read').click();
    await expect(notice.getByTestId('notification-open')).toHaveCount(0);
    expect(
      (await invoke<NotificationClientDTO>(main, NotificationChannels.GET, first.id)).isRead,
    ).toBe(true);
    expect(await attention(main)).toBe(1);
    await expect(main.getByTestId('capsule-badge-notification')).toHaveText('1');
    await expect(main.locator('[data-notification-id="' + first.id + '"]')).toHaveAttribute(
      'data-read-state',
      'read',
    );

    // Acknowledged delivery stays dismissed across a real host restart; owner work remains.
    await app.close();
    app = await launch(storageRoot);
    main = await enterLocalWorkspace(app);
    await main.getByTestId('capsule-nav-notification').click();
    await expect(main.getByTestId('notification-center')).toBeVisible();
    expect(await attention(main)).toBe(1);
    expect((await pending(main)).map((row) => row.id)).toEqual([first.id]);
    await main.waitForTimeout(1_500);
    for (const page of app
      .windows()
      .filter((page) => page.url().includes('/custom-notification'))) {
      await expect(page.getByTestId('notification-open')).toHaveCount(0);
    }
    await main.screenshot({ path: testInfo.outputPath('read-routine-still-pending.png') });

    // The notification center completes the owner, then the existing last-satisfied trigger starts again.
    await main.getByTestId('notification-action-complete').click();
    await expect.poll(() => attention(main)).toBe(0);
    notice = await popup(app);
    await expect(notice.getByTestId('notification-open')).toContainText(
      'Attention acceptance break',
      { timeout: 30_000 },
    );
    const second = (await pending(main))[0]!;
    expect(second.id).not.toBe(first.id);
    expect(await attention(main)).toBe(1);

    // Custom snooze uses the real owner deadline and produces one actionable occurrence on return.
    await notice.getByTestId('notification-snooze').click();
    await notice.getByTestId('notification-snooze-minutes').fill('1');
    await notice.getByTestId('notification-snooze-apply').click();
    await expect(notice.getByTestId('notification-open')).toHaveCount(0);
    await expect.poll(() => attention(main)).toBe(0);
    expect(
      (await invoke<NotificationClientDTO>(main, NotificationChannels.GET, second.id)).isRead,
    ).toBe(true);
    await expect(notice.getByTestId('notification-open')).toContainText(
      'Attention acceptance break',
      { timeout: 75_000 },
    );
    await expect.poll(() => attention(main)).toBe(1);
    await expect(main.getByTestId('notification-item')).toHaveCount(1);
    await expect(main.getByTestId('capsule-badge-notification')).toHaveText('1');
    expect(await pending(main)).toHaveLength(1);

    // A main-window action closes the still-visible popup through the shared database event.
    await main.getByTestId('notification-action-complete').click();
    await expect.poll(() => attention(main)).toBe(0);
    await expect(notice.getByTestId('notification-open')).toHaveCount(0);
  } finally {
    await app.close().catch(() => {});
  }
});
