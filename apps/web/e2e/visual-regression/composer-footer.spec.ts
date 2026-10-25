import { expect, test, type Page, type Locator } from '@playwright/test';
import { openVisualCase, waitForVisualLayout } from './environment';

async function footerGeometry(button: Locator) {
  return button.evaluate((element) => {
    const footer = element.parentElement!;
    const row = element.getBoundingClientRect();
    const box = footer.getBoundingClientRect();
    const style = getComputedStyle(footer);
    const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
    return {
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
      left,
      right,
      footerY: box.y,
      footerHeight: box.height,
      padding: getComputedStyle(element).paddingLeft,
    };
  });
}

async function expectFullRow(button: Locator) {
  await expect(button).toBeVisible();
  const box = await footerGeometry(button);
  expect(box.footerHeight).toBe(44);
  expect(box.height).toBe(32);
  expect(Math.abs(box.width - (box.right - box.left))).toBeLessThanOrEqual(1);
  expect(Math.abs(box.x - box.left)).toBeLessThanOrEqual(1);
  // The top border consumes 1px of the footer's centered content box.
  expect(Math.abs(box.y + box.height / 2 - (box.footerY + 22.5))).toBeLessThanOrEqual(1);
  return box;
}

async function expectRowFeedback(page: Page, button: Locator) {
  await page.mouse.move(0, 0);
  const idle = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
  const box = await footerGeometry(button);
  await page.mouse.move(box.right - 2, box.y + box.height / 2);
  await expect
    .poll(() => button.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(idle);
  await button.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(button).toBeFocused();
  expect(await button.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  expect(await button.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
}

for (const host of ['web', 'desktop'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [440, 840, 1280]) {
      test(`#483 ${host} full footer rows ${width}px ${theme}`, async ({ page }) => {
        await openVisualCase(page, {
          owner: 'pages',
          host,
          theme,
          locale: 'en-US',
          width: 'wide',
          clock: 'running',
          query: `surface=shell-split${width === 840 ? '&accountName=' + 'LongAccountName'.repeat(12) : ''}`,
        });
        await page.setViewportSize({ width, height: 900 });
        await page.getByTestId('shell-sidebar-toggle').click();
        const account = page.getByTestId('shell-account-menu').filter({ visible: true });
        await waitForVisualLayout(page);
        const before = await expectFullRow(account);
        if (width === 840) {
          const name = account.getByTestId('shell-account-name');
          expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
          expect(await name.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
        }
        await expectRowFeedback(page, account);
        await page.mouse.click(before.right - 2, before.y + before.height / 2);
        await expect(page.getByTestId('shell-open-settings')).toBeVisible();
        await page.getByTestId('shell-open-settings').click();
        if (width < 1024) await page.getByTestId('shell-sidebar-toggle').click();
        const back = page.getByTestId('settings-return-to-app').filter({ visible: true });
        const after = await expectFullRow(back);
        expect(after.padding).toBe(before.padding);
        await expectRowFeedback(page, back);
        if (width >= 1024) {
          expect(after.y).toBe(before.y);
          expect(after.x).toBe(before.x);
        }
        await page.mouse.click(after.right - 2, after.y + after.height / 2);
        await expect(page.getByTestId('app-shell')).toHaveAttribute(
          'data-shell-scene',
          'workspace',
        );
        await expect(page.getByTestId('task-page-toolbar')).toBeVisible();
      });
    }
  }
}

for (const host of ['web', 'desktop'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const [scene, width] of [
      ['shell-split', 1280],
      ['shell-focus', 1280],
      ['shell-split', 440],
    ] as const) {
      test(`#483 ${host} bordered composer ${scene} ${width}px ${theme}`, async ({
        page,
      }, testInfo) => {
        await openVisualCase(page, {
          owner: 'pages',
          host,
          theme,
          locale: 'en-US',
          width: 'wide',
          clock: 'running',
          query: `surface=${scene}`,
        });
        await page.setViewportSize({ width, height: 900 });
        if (width === 440) await page.getByTestId('shell-right-panel-toggle').click();
        const surface = page.getByTestId('ai-composer-surface');
        const input = page.getByTestId('ai-chat-composer');
        await expect(surface).toBeVisible();
        await waitForVisualLayout(page);
        // The chat view autofocuses its input; move focus outside before measuring idle.
        await page.getByTestId('shell-sidebar-toggle').focus();
        const paint = () =>
          surface.evaluate(async (el) => {
            await Promise.all(el.getAnimations().map((animation) => animation.finished));
            const style = getComputedStyle(el);
            return {
              shadow: style.boxShadow,
              borders: [
                style.borderTopWidth,
                style.borderRightWidth,
                style.borderBottomWidth,
                style.borderLeftWidth,
              ],
              color: style.borderTopColor,
            };
          });
        const box = await surface.evaluate((el) => {
          const { left, right, bottom } = el.getBoundingClientRect();
          return { left, right, bottom };
        });
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
        expect(box.bottom).toBeLessThanOrEqual(900);
        const idle = await paint();
        await page.screenshot({ path: testInfo.outputPath('composer-idle.png') });
        expect(idle.shadow).toBe('none');
        expect(idle.borders).toEqual(['1px', '1px', '1px', '1px']);
        expect(
          await page
            .getByTestId('ai-footer-composer')
            .evaluate((el) => getComputedStyle(el).backgroundImage),
        ).toBe('none');
        const initialHeight = await input.evaluate((el) => el.getBoundingClientRect().height);
        await input.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(input).toBeFocused();
        const focused = await paint();
        expect(focused.shadow).toBe('none');
        expect(focused.color).not.toBe(idle.color);
        expect(await input.evaluate((el) => el.getBoundingClientRect().height)).toBe(initialHeight);
        await input.fill('First line\nSecond line\nThird line\nFourth line');
        expect(await input.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(
          initialHeight,
        );
        await surface.dispatchEvent('dragenter');
        expect((await paint()).color).not.toBe(focused.color);
        await surface.dispatchEvent('dragleave');
        expect((await paint()).color).toBe(focused.color);
        await page.getByTestId('ai-chat-add-context').click();
        const menu = page.getByRole('menu');
        await expect(menu).toBeVisible();
        expect(await menu.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('ai-chat-add-context')).toBeFocused();
      });
    }
  }
}
