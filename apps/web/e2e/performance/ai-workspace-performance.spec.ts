/**
 * AI workspace performance regressions.
 *
 * The standalone cross-domain overview was retired; `/` now owns the AI
 * workspace. These checks target only current workspace surfaces.
 */

import { expect, test } from '@playwright/test';
import { login } from '../helpers/testHelpers';
import { WEB_CONFIG } from '../config';

type LargestContentfulPaintLike = PerformanceEntry & {
  renderTime?: number;
  loadTime?: number;
};

type PerformanceWithMemory = Performance & {
  memory?: { usedJSHeapSize: number };
};

test.describe('AI workspace performance', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('[P0] loads the AI workspace and its core surfaces within 2.5 seconds', async ({
    page,
  }) => {
    const start = Date.now();

    await page.goto(WEB_CONFIG.getFullUrl('/'));
    await expect(page.getByTestId('ai-chat-view')).toBeVisible();
    await expect(page.getByTestId('ai-message-panel')).toBeVisible();
    await expect(page.getByTestId('ai-footer-composer')).toBeVisible();

    expect(Date.now() - start).toBeLessThanOrEqual(2500);
  });

  test('[P0] reaches First Contentful Paint within 1 second', async ({ page }) => {
    await page.goto(WEB_CONFIG.getFullUrl('/'));

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
    await page.goto(WEB_CONFIG.getFullUrl('/'));

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

  test('[P1] opens the AI tool menu within 300ms', async ({ page }) => {
    await page.goto(WEB_CONFIG.getFullUrl('/'));
    await expect(page.getByTestId('ai-footer-composer')).toBeVisible();
    const start = Date.now();

    await page.getByTestId('ai-chat-tool-menu-trigger').click();
    await expect(page.getByTestId('ai-chat-tool-goal-create')).toBeVisible();

    expect(Date.now() - start).toBeLessThanOrEqual(300);
  });

  test('[P1] preserves one AI workspace while resizing', async ({ page }) => {
    await page.goto(WEB_CONFIG.getFullUrl('/'));
    const workspace = page.getByTestId('ai-chat-view');
    await expect(workspace).toBeVisible();
    await workspace.evaluate((element) => element.setAttribute('data-instance-probe', 'ai'));

    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      const start = Date.now();
      await page.setViewportSize(viewport);
      await expect(workspace).toHaveAttribute('data-instance-probe', 'ai');
      await expect(page.getByTestId('ai-footer-composer')).toBeVisible();
      expect(Date.now() - start).toBeLessThanOrEqual(500);
    }
  });

  test('[P2] repeated workspace menu interactions do not grow heap by 10MB', async ({ page }) => {
    await page.goto(WEB_CONFIG.getFullUrl('/'));
    await expect(page.getByTestId('ai-footer-composer')).toBeVisible();
    const readHeap = () =>
      page.evaluate(() => (performance as PerformanceWithMemory).memory?.usedJSHeapSize ?? 0);
    const initialMemory = await readHeap();

    for (let index = 0; index < 5; index += 1) {
      await page.getByTestId('ai-chat-tool-menu-trigger').click();
      await expect(page.getByTestId('ai-chat-tool-goal-create')).toBeVisible();
      await page.keyboard.press('Escape');
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
      const start = Date.now();
      await page.goto(WEB_CONFIG.getFullUrl('/'));
      await expect(page.getByTestId('ai-footer-composer')).toBeVisible();
      expect(Date.now() - start).toBeLessThanOrEqual(10000);
    } finally {
      await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
  });
});
