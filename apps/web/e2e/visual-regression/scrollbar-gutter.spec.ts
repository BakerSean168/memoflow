import { writeFile } from 'node:fs/promises';
import { expect, test, type Locator } from '@playwright/test';
import { openVisualCase, waitForVisualLayout } from './environment';

async function geometry(locator: Locator) {
  return locator.evaluate((element) => {
    const { x, width } = element.getBoundingClientRect();
    return { x, width };
  });
}

// Playwright hides scrollbars by default. Explicitly use classic occupied tracks
// for this suite, and independently assert their measured width below.
test.use({
  launchOptions: {
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: ['--disable-features=OverlayScrollbar,FluentOverlayScrollbar'],
  },
});

// Exercise production scroll owners, keeping viewport, owner and content width
// constraints identical while only a child's height changes.
for (const host of ['web', 'desktop'] as const) {
  for (const width of [440, 1280, 1600]) {
    for (const surface of ['providers', 'workspace', 'chat', 'shared-list'] as const) {
      test(`#484 ${host} ${surface} classic scrollbar geometry ${width}px`, async ({
        page,
      }, testInfo) => {
        await openVisualCase(page, {
          owner: 'pages',
          host,
          theme: 'light',
          locale: 'en-US',
          width: width === 440 ? 'narrow' : 'wide',
          clock: 'running',
          query:
            surface === 'providers'
              ? 'surface=settings&tab=ai&acceptance=484'
              : surface === 'shared-list'
                ? 'surface=shared-list&acceptance=484'
                : 'surface=shell-split&acceptance=484',
        });
        await page.setViewportSize({ width, height: 1800 });
        const scroll =
          surface === 'providers'
            ? page.getByTestId('settings-content-scroll')
            : surface === 'workspace'
              ? page.getByTestId('task-management-scroll-host')
              : surface === 'shared-list'
                ? page.getByTestId('list-page-scroll-host')
                : page.getByTestId('ai-message-panel');
        if (surface === 'chat' && width === 440) {
          // The narrow shell starts in business focus; switch to the chat scene.
          await page.getByTestId('shell-right-panel-toggle').click();
        }
        if (surface === 'providers')
          await expect(page.getByTestId('ai-mastra-agent-name')).toBeVisible();
        await expect(scroll).toBeVisible();
        await waitForVisualLayout(page);
        expect(await scroll.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');
        const content =
          surface === 'shared-list'
            ? page.getByTestId('shared-list-content')
            : surface === 'workspace'
              ? scroll.locator(':scope > *').first()
              : scroll.locator(':scope > div').first();
        const edge =
          surface === 'providers'
            ? page.getByTestId('ai-settings-panel').locator('header').first()
            : content;
        const chrome =
          surface === 'providers'
            ? width === 440
              ? page.getByTestId('settings-compact-back')
              : page.getByTestId('settings-return-to-app')
            : surface === 'workspace'
              ? page.getByTestId('task-page-toolbar')
              : surface === 'shared-list'
                ? page.getByTestId('list-page-toolbar')
                : page.getByTestId('global-composer');
        expect(await scroll.evaluate((el) => getComputedStyle(el).scrollbarGutter)).toContain(
          'stable',
        );
        const chromeBefore = await chrome.boundingBox();
        const before = {
          scroll: await geometry(scroll),
          content: await geometry(content),
          edge: await geometry(edge),
        };
        const initial = await scroll.evaluate((el) => ({
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
        }));
        expect(initial.scrollHeight).toBeLessThanOrEqual(initial.clientHeight + 1);
        await scroll.evaluate((el) => {
          const spacer = document.createElement('div');
          spacer.dataset.scrollbarProbe = '';
          spacer.style.cssText = `height:${el.clientHeight * 3}px;flex-shrink:0`;
          el.append(spacer);
        });
        const metrics = await scroll.evaluate((el) => ({
          selector: el.getAttribute('data-testid') ?? el.className,
          clientWidth: el.clientWidth,
          offsetWidth: (el as HTMLElement).offsetWidth,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          gutter: getComputedStyle(el).scrollbarGutter,
        }));
        expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
        // Fail loudly in overlay environments: otherwise this regression is vacuous.
        expect(metrics.offsetWidth - metrics.clientWidth).toBeGreaterThan(0);
        await page.screenshot({ path: testInfo.outputPath('overflow.png') });
        const overflowing = {
          scroll: await geometry(scroll),
          content: await geometry(content),
          edge: await geometry(edge),
        };
        expect(await chrome.boundingBox()).toEqual(chromeBefore);
        await scroll.hover();
        await page.mouse.wheel(0, 240);
        await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        await scroll.evaluate((el) => el.querySelector('[data-scrollbar-probe]')!.remove());
        const after = {
          scroll: await geometry(scroll),
          content: await geometry(content),
          edge: await geometry(edge),
        };
        const evidencePath = testInfo.outputPath('scroll-owner.json');
        await writeFile(
          evidencePath,
          JSON.stringify({ metrics, before, overflowing, after }, null, 2),
        );
        await testInfo.attach('scroll-owner', {
          path: evidencePath,
          contentType: 'application/json',
        });
        expect(await chrome.boundingBox()).toEqual(chromeBefore);
        expect(await scroll.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
        expect(
          await page.evaluate(() => {
            const root = document.scrollingElement!;
            return root.scrollHeight <= root.clientHeight + 1;
          }),
        ).toBe(true);
        for (const current of [overflowing, after]) {
          for (const key of ['scroll', 'content', 'edge'] as const) {
            expect(Math.abs(current[key].x - before[key].x), `${key} x`).toBeLessThanOrEqual(1);
            expect(
              Math.abs(current[key].width - before[key].width),
              `${key} width`,
            ).toBeLessThanOrEqual(1);
          }
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        expect(await scroll.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      });
    }
  }
}
