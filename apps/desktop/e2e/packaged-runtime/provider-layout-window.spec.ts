import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { _electron as electron, type ElectronApplication } from 'playwright';
import { createIsolatedNativeAgentEnvironment } from './isolated-native-env';

const packagedExe = process.env.MEMOFLOW_PACKAGED_EXECUTABLE;

test.skip(process.platform !== 'win32', 'Windows packaged Provider layout acceptance');

test('packaged Windows Providers maintain 80px rows and responsive details at 840/1280/1600', async ({}, testInfo) => {
  test.setTimeout(180_000);
  expect(packagedExe, 'MEMOFLOW_PACKAGED_EXECUTABLE is required').toBeTruthy();
  expect(fs.existsSync(packagedExe!), 'Packaged executable must exist').toBe(true);
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-provider-window-'));
  const sanitizedEnvironment = createIsolatedNativeAgentEnvironment(fixtureRoot);
  let app: ElectronApplication | null = null;
  try {
    app = await electron.launch({
      executablePath: packagedExe!,
      args: ['--disable-gpu', '--disable-dev-shm-usage'],
      env: {
        ...sanitizedEnvironment,
        MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: path.join(fixtureRoot, 'profile'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });
    const page = await app.firstWindow({ timeout: 45_000 });
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 45_000 });
    await page.evaluate(() => {
      window.location.hash = '#/settings?tab=ai';
    });
    const settings = page.getByTestId('ai-settings-panel');
    await expect(settings).toBeVisible({ timeout: 45_000 });
    const list = settings.getByTestId('ai-provider-list');
    const order = await list
      .locator('[data-testid^="ai-provider-select-agent:"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid')?.split(':')[1]));
    expect(order).toEqual(['codex', 'claude', 'pi', 'dsh', 'antigravity', 'mastra']);
    await settings.getByTestId('ai-provider-select-agent:codex').click();
    await expect(settings.getByTestId('ai-provider-detail')).toBeVisible();
    await expect(settings.getByText(/已认证为|Authenticated as/i)).toHaveCount(0); // Empty native Home must not expose real account metadata.
    await expect(settings.getByTestId('ai-provider-detail-toggle')).toHaveCount(0);
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme });
      for (const width of [840, 1280, 1600]) {
        await page.setViewportSize({ width, height: 960 });
        const metrics = await page.evaluate(() => {
          const listEl = document.querySelector('[data-testid="ai-provider-list"]')!;
          const detailEl = document.querySelector('[data-testid="ai-provider-detail"]')!;
          const rect = (el: Element) => {
            const { left, top, right, bottom } = el.getBoundingClientRect();
            return { left, top, right, bottom };
          };
          return {
            innerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            list: rect(listEl),
            detail: rect(detailEl),
            rowHeights: Array.from(
              listEl.querySelectorAll('[role="listitem"]'),
              (el) => el.getBoundingClientRect().height,
            ),
          };
        });
        expect(metrics.innerWidth).toBe(width);
        expect(metrics.scrollWidth).toBeLessThanOrEqual(width + 1);
        expect(metrics.rowHeights).toHaveLength(6);
        for (const rowHeight of metrics.rowHeights) {
          expect(Math.abs(rowHeight - 80)).toBeLessThan(1);
        }
        if (width >= 1280) {
          expect(metrics.detail.left).toBeGreaterThanOrEqual(metrics.list.right - 1);
        } else {
          expect(metrics.detail.top).toBeGreaterThanOrEqual(metrics.list.bottom - 1);
        }
        await testInfo.attach('providers-' + colorScheme + '-' + width + '.png', {
          body: await settings.screenshot({ animations: 'disabled' }),
          contentType: 'image/png',
        });
      }
    }
    const button = settings.getByTestId('ai-provider-select-agent:codex');
    // Real keyboard traversal must focus the trigger from the adjacent switch;
    // Playwright focus() alone may reuse an existing pointer-focused element.
    await button.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(button).toBeFocused();
    const tooltip = page.locator('[role="tooltip"]');
    await expect(button).toHaveAttribute('data-state', 'instant-open');
    await expect(button).toHaveAttribute('aria-describedby', /reka-tooltip-content/);
    // Reka provides an aria-described-by node; use DOM role locator for its portal
    // because Playwright getByRole() filters the accessibility-hidden visual twin.
    await expect(tooltip).toBeVisible({ timeout: 5000 });
    await button.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await expect(button).toBeFocused();
  } finally {
    if (app) await app.close();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
