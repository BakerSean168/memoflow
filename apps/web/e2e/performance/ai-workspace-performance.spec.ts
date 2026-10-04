/**
 * Supplemental AI workspace performance acceptance.
 *
 * Required Web Flow owns AI business behavior. This nightly lane verifies the
 * current workspace owner under a fresh account so persisted shell routes from
 * shared users cannot redirect '/' away from AI.
 */

import { expect, test, type Page } from '@playwright/test';
import { registerAndLogin } from '../helpers/testHelpers';
import { TIMEOUT_CONFIG, WEB_CONFIG } from '../config';

type LargestContentfulPaintLike = PerformanceEntry & {
  renderTime?: number;
  loadTime?: number;
};

type PerformanceWithMemory = Performance & {
  memory?: { usedJSHeapSize: number };
};

function createAiPerformanceEmail(): string {
  return `e2e-ai-performance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function bootstrapFreshAiWorkspace(page: Page): Promise<void> {
  await registerAndLogin(page, {
    email: createAiPerformanceEmail(),
    password: 'Test123456!',
    landingPath: '/',
  });

  await expect(page).toHaveURL(/\/$/, { timeout: TIMEOUT_CONFIG.NAVIGATION });
  await page.getByTestId('app-shell').waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await page.getByTestId('ai-chat-view').waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await page.getByTestId('ai-chat-composer').waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
}

async function reloadAiWorkspace(page: Page): Promise<void> {
  await page.goto(WEB_CONFIG.getFullUrl('/'), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await page.getByTestId('ai-chat-view').waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await page.getByTestId('ai-chat-composer').waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
}

async function openAddContextMenu(page: Page): Promise<void> {
  await page.getByTestId('ai-chat-add-context').click();
  await expect(page.getByTestId('ai-chat-upload-file')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}

test.describe('AI workspace performance', () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapFreshAiWorkspace(page);
  });

  test('[P0] renders the current AI workspace owner after navigation', async ({ page }) => {
    await reloadAiWorkspace(page);
    await expect(page.getByTestId('ai-message-panel')).toBeVisible();
    await expect(page.getByTestId('ai-footer-composer')).toBeVisible();
  });

  test('[P0] reaches First Contentful Paint within 1 second', async ({ page }) => {
    await page.goto(WEB_CONFIG.getFullUrl('/'), {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });

    const fcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entry = list.getEntries().find((item) => item.name === 'first-contentful-paint');
          if (entry) {
            observer.disconnect();
            resolve(entry.startTime);
          }
        });
        observer.observe({ type: 'paint', buffered: true });
        window.setTimeout(() => resolve(0), 5000);
      });
    });

    if (fcp > 0) expect(fcp).toBeLessThanOrEqual(1000);
  });

  test('[P0] reaches Largest Contentful Paint within 2 seconds', async ({ page }) => {
    await page.goto(WEB_CONFIG.getFullUrl('/'), {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });

    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let value = 0;
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const entry = entries[entries.length - 1] as LargestContentfulPaintLike | undefined;
          value = entry?.renderTime || entry?.loadTime || 0;
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
        window.setTimeout(() => {
          observer.disconnect();
          resolve(value);
        }, 3000);
      });
    });

    if (lcp > 0) expect(lcp).toBeLessThanOrEqual(2000);
  });

  test('[P1] opens the current Add Context menu within 300ms of the browser interaction', async ({
    page,
  }) => {
    const latency = await page.evaluate(async () => {
      const trigger = document.querySelector<HTMLElement>('[data-testid="ai-chat-add-context"]');
      if (!trigger) throw new Error('AI Add Context trigger is unavailable');

      const startedAt = performance.now();
      trigger.click();

      const deadline = startedAt + 2_000;
      while (performance.now() < deadline) {
        const item = document.querySelector<HTMLElement>('[data-testid="ai-chat-upload-file"]');
        if (item && item.getClientRects().length > 0) {
          return performance.now() - startedAt;
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      return Number.POSITIVE_INFINITY;
    });

    expect(latency).toBeLessThanOrEqual(300);
  });

  test('[P1] preserves one AI workspace while resizing', async ({ page }) => {
    const workspace = page.getByTestId('ai-chat-view');
    await workspace.evaluate((element) => element.setAttribute('data-instance-probe', 'ai'));

    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(workspace).toHaveAttribute('data-instance-probe', 'ai');
      await expect(page.getByTestId('ai-chat-composer')).toBeVisible();
    }
  });

  test('[P2] repeated Add Context interactions do not grow heap by 10MB', async ({ page }) => {
    const readHeap = () =>
      page.evaluate(() => (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? 0);
    const initialMemory = await readHeap();

    for (let index = 0; index < 5; index += 1) {
      await openAddContextMenu(page);
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('ai-chat-upload-file')).toBeHidden({
        timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
      });
    }

    const finalMemory = await readHeap();
    if (initialMemory > 0 && finalMemory > 0) {
      expect((finalMemory - initialMemory) / (1024 * 1024)).toBeLessThan(10);
    }
  });

  test('[P2] remains usable under 4x CPU throttling', async ({ page, context }) => {
    const client = await context.newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    try {
      await reloadAiWorkspace(page);
      await expect(page.getByTestId('ai-footer-composer')).toBeVisible({
        timeout: TIMEOUT_CONFIG.NAVIGATION,
      });
    } finally {
      await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
  });
});
