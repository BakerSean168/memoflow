import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export const VISUAL_TIME = '2026-10-01T09:30:00Z';
export const PANEL_WIDTHS = { wide: 1280, narrow: 520 } as const;

export async function openVisualCase(
  page: Page,
  entry: {
    owner: string;
    theme: string;
    locale: string;
    width: 'wide' | 'narrow';
    query?: string;
    host?: 'web' | 'desktop';
  },
) {
  const externalRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const root = path.resolve(import.meta.dirname, '../../../../dist/visual-regression');
    const file = path.resolve(
      root,
      `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`,
    );
    // Serve the built fixture bytes directly: browser capture never depends on loopback networking.
    if (url.hostname === '127.0.0.1' && file.startsWith(`${root}${path.sep}`)) {
      await route.fulfill({ path: file });
    } else {
      externalRequests.push(url.href);
      await route.abort();
    }
  });
  await page.setViewportSize({ width: PANEL_WIDTHS[entry.width], height: 900 });
  await page.emulateMedia({
    colorScheme: entry.theme === 'dark' ? 'dark' : 'light',
    reducedMotion: 'reduce',
  });
  await page.clock.setFixedTime(new Date(VISUAL_TIME));
  const query = new URLSearchParams({
    owner: entry.owner,
    theme: entry.theme,
    locale: entry.locale,
    panelWidth: String(PANEL_WIDTHS[entry.width]),
  });
  for (const [key, value] of new URLSearchParams(entry.query)) query.set(key, value);
  await page.goto(`${entry.host === 'desktop' ? '/desktop/index.html' : '/'}?${query}`);
  return externalRequests;
}

export async function waitForVisualLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect(page.locator('html')).toHaveAttribute('lang', /^(en-US|zh-CN)$/);
}
