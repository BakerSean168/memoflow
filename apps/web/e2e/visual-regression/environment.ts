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
    clock?: 'fixed' | 'running';
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
  // Vue ignores bubbling events timestamped at the listener's installation time.
  // Interactions need a progressing Date.now; screenshot-only cases keep fixed time.
  if (entry.clock === 'running') await page.clock.install({ time: new Date(VISUAL_TIME) });
  else await page.clock.setFixedTime(new Date(VISUAL_TIME));
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

/**
 * #783: the AI chat body follows new content with a smooth scroll on mount. The scroll target is
 * read before the workflow card finishes laying out, so the animation can stop 41px above the real
 * bottom, and a screenshot taken mid-animation captures that same offset. Wait for the content
 * height to stop changing, pin the body to its resting bottom position, then require consecutive
 * identical samples of the body box so the capture never races the scroll.
 */
export async function waitForChatBodyToSettle(page: Page) {
  const panel = page.getByTestId('ai-message-panel');
  const body = page.getByTestId('ai-welcome-state');
  const sample = async () => {
    const metrics = await panel.evaluate((element) => ({
      scrollTop: Math.round(element.scrollTop),
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    const box = await body.boundingBox();
    return {
      ...metrics,
      y: box ? Math.round(box.y * 10) / 10 : null,
      height: box ? Math.round(box.height * 10) / 10 : null,
    };
  };
  let previous = await sample();
  await expect
    .poll(
      async () => {
        const current = await sample();
        const settled = current.scrollHeight === previous.scrollHeight;
        previous = current;
        return settled;
      },
      { timeout: 5_000, intervals: [50, 100, 100, 200] },
    )
    .toBe(true);
  await panel.evaluate((element) =>
    element.scrollTo({ top: element.scrollHeight, behavior: 'auto' }),
  );
  let last = await sample();
  await expect
    .poll(
      async () => {
        const current = await sample();
        const atBottom = current.scrollTop >= current.scrollHeight - current.clientHeight - 1;
        const stable =
          atBottom &&
          current.scrollTop === last.scrollTop &&
          current.scrollHeight === last.scrollHeight &&
          current.y === last.y &&
          current.height === last.height;
        last = current;
        return stable;
      },
      { timeout: 5_000, intervals: [50, 100, 100, 200] },
    )
    .toBe(true);
}
