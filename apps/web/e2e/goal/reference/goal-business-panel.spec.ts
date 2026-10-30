import { expect, test } from '@playwright/test';
import { dumpScrollProbeOnFailure, installScrollProbe } from './scroll-probe';

// Real native owner components, deterministic service doubles; not AI-provider or database E2E evidence.
test.beforeEach(async ({ page }) => {
  await installScrollProbe(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await dumpScrollProbeOnFailure(page, testInfo);
});

test('large Goal editor holds panel-relative dimensions while a key result expands and only its body scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('/?surface=panel&state=create&locale=en-US&theme=dark');

  const editor = page.getByTestId('goal-panel-form');
  const body = editor.locator('[data-scroll-host="pane-dialog"]');
  const measure = async () =>
    await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-testid="goal-panel-form"]')!;
      const pane = document.querySelector<HTMLElement>('[data-testid="reference-business-pane"]')!;
      const scroll = card.querySelector<HTMLElement>('[data-scroll-host="pane-dialog"]')!;
      const footer = card.querySelector<HTMLElement>('footer')!;
      const cardRect = card.getBoundingClientRect();
      const paneRect = pane.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      return {
        card: { x: cardRect.x, y: cardRect.y, width: cardRect.width, height: cardRect.height },
        pane: { width: paneRect.width, height: paneRect.height },
        footerY: footerRect.y,
        scrollHeight: scroll.scrollHeight,
        clientHeight: scroll.clientHeight,
        scrollTop: scroll.scrollTop,
      };
    });

  const initial = await measure();
  expect(initial.card.width).toBeGreaterThan(initial.pane.width * 0.78);
  expect(initial.card.width).toBeLessThanOrEqual(960);
  expect(initial.card.height).toBeGreaterThan(initial.pane.height * 0.7);
  expect(initial.card.height).toBeLessThanOrEqual(900);

  await page.getByTestId('add-key-result-entry').click();
  await expect(page.getByTestId('key-result-draft-form')).toBeVisible();
  await expect
    .poll(async () => body.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(0);
  await expect.poll(async () => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.getByTestId('draft-kr-title-input').fill('Measurable expanded result');
  const expanded = await measure();

  // Content changes must NEVER change the card or move its persistent action bar.
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(expanded.card[key] - initial.card[key])).toBeLessThan(1.1);
  }
  expect(Math.abs(expanded.footerY - initial.footerY)).toBeLessThan(1.1);

  // Resizing the business pane / viewport is the ONLY cause for size recomputation.
  await page.setViewportSize({ width: 1400, height: 580 });
  const resized = await measure();
  expect(resized.card.height).toBeLessThan(initial.card.height);
  expect(resized.card.height).toBeGreaterThan(resized.pane.height * 0.7);
  expect(resized.card.height).toBeLessThan(resized.pane.height);

  // Large displays must cap the card at the declared pixel limits, not
  // re-expand when a new KR or long description is added.
  await page.setViewportSize({ width: 2400, height: 1300 });
  const capped = await measure();
  expect(Math.abs(capped.card.width - 960)).toBeLessThan(1.1);
  expect(Math.abs(capped.card.height - 900)).toBeLessThan(1.1);

  await expect(page.getByTestId('reference-chat-composer')).toBeVisible();
  await expect(editor).toBeVisible();
});

test('AI capability updates actual fields and hands off unsaved draft before user save', async ({
  page,
}) => {
  await page.goto('/?surface=panel&state=create&control=ai&locale=en-US');
  await expect(page.getByTestId('goal-name-input')).toHaveValue('AI draft');
  await expect(page.getByTestId('goal-name-input')).toBeDisabled();
  await expect(page.getByTestId('save-goal-button')).toBeDisabled();
  await page.getByTestId('business-patch').click();
  await expect(page.getByTestId('goal-name-input')).toHaveValue('Updated by owner command');
  await expect(page.getByTestId('goal-description-input')).toHaveValue('Actual batch patch result');
  await expect(page.getByTestId('business-command-result')).toHaveText('Applied');
  await page.getByTestId('business-handoff').click();
  await expect(page.getByTestId('business-command-result')).toHaveText('Handed off without saving');
  await expect(page.getByTestId('goal-name-input')).toBeEnabled();
  const before = await page.evaluate(() =>
    (
      window as unknown as { goalReferenceEvidence: () => { calls: string[] } }
    ).goalReferenceEvidence(),
  );
  expect(before.calls).not.toContain('create');
  await page.getByTestId('goal-name-input').fill('Edited after handoff');
  await page.getByTestId('save-goal-button').click();
  await expect(page.getByTestId('goal-panel-form')).toHaveCount(0);
  const after = await page.evaluate(() =>
    (
      window as unknown as {
        goalReferenceEvidence: () => { calls: string[]; goal: { name: string } };
      }
    ).goalReferenceEvidence(),
  );
  expect(after.calls.filter((call) => call === 'create')).toHaveLength(1);
  expect(after.goal.name).toBe('Edited after handoff');
});
