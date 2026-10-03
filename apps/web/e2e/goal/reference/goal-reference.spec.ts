import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, query = '') {
  await page.clock.setFixedTime(new Date('2026-09-30T01:00:00Z'));
  await page.goto(`/?${query}`);
  await expect(
    page.getByTestId(query.includes('state=create') ? 'goal-dialog' : 'goal-detail-view'),
  ).toBeVisible();
}
async function capture(page: Page, name: string) {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    maxDiffPixelRatio: 0.002,
  });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // Check after every state, including fixture bootstrap, dialogs and mutations.
  Object.assign(page, { referenceErrors: errors });
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { referenceErrors: string[] }).referenceErrors).toEqual([]);
});

for (const locale of ['en-US', 'zh-CN']) {
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 1280]) {
      test(`${locale} ${theme} ${width}: multi-KR, no-KR, create and Inspect baselines`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const query = `locale=${locale}&theme=${theme}`;
        await open(page, query);
        await expect(
          page
            .getByTestId('goal-workspace-key-results')
            .locator('[data-testid^="goal-kr-summary-"]'),
        ).toHaveCount(5);
        // Product day is Sep 29 in Los Angeles while UTC is Sep 30: target remains current.
        await expect(page.getByTestId('goal-past-target')).toHaveCount(0);
        await capture(page, 'multi-kr');
        expect(
          await page
            .locator('[data-testid^=goal-kr-summary-]')
            .evaluateAll((elements) =>
              elements.every((element) => element.scrollWidth <= element.clientWidth),
            ),
        ).toBe(true);
        await page.clock.setFixedTime(new Date('2026-09-30T12:00:00Z'));
        await page.reload();
        await expect(page.getByTestId('goal-past-target')).toBeVisible();
        await expect(page.getByTestId('goal-status')).toHaveAttribute(
          'data-goal-status',
          'InProgress',
        );
        await page
          .getByTestId('goal-kr-summary-kr-0')
          .getByRole('button', { name: locale === 'zh-CN' ? '更多' : 'More', exact: true })
          .click();
        await page.getByTestId('goal-kr-detail-kr-0').click();
        await expect(page.getByTestId('goal-kr-inspect')).toBeVisible();
        const ownerReads = await page.evaluate(
          () =>
            (window as unknown as { goalReferenceEvidence(): { calls: string[] } })
              .goalReferenceEvidence()
              .calls.filter((call) => call === 'workspace').length,
        );
        expect(ownerReads).toBe(1);
        await capture(page, 'inspect-expired');
        await open(page, `${query}&state=empty`);
        await expect(page.getByTestId('goal-progress-needs-kr')).toBeVisible();
        await capture(page, 'no-kr');
        await open(page, `${query}&state=create`);
        await expect(page.getByTestId('goal-dialog')).toBeVisible();
        await capture(page, 'create-empty');
        await open(page, `${query}&state=review`);
        await expect(page.getByTestId('goal-review-create-dialog')).toBeVisible();
        await page.locator('#goal-review-reflection').fill('Observed progress');
        await capture(page, 'review-create');
        await page.getByTestId('goal-review-save').click();
        await expect(page.getByTestId('goal-review-inspect-dialog')).toBeVisible();
        await capture(page, 'review-inspect');
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      });
    }
  }
}

test('production Goal → KR → Record → trajectory → first/subsequent Review without AI', async ({
  page,
}) => {
  await open(page);
  await page.getByTestId('goal-quick-check-in-kr-0').click();
  await page.locator('#change-amount').fill('2');
  await expect(page.getByTestId('save-goal-record')).toBeEnabled();
  await capture(page, 'record-preview');
  await page.getByTestId('save-goal-record').click();
  await expect(page.getByTestId('goal-record-dialog')).toHaveCount(0);
  await expect(page.getByTestId('goal-quick-check-in-kr-0')).toContainText('6');
  // Normal Goal properties menu owns Review create; compatibility navigation remains in Goal.
  await page.getByTestId('goal-properties-more').click();
  await page.getByRole('menuitem', { name: 'Reviews', exact: true }).hover();
  await page.getByRole('menuitem', { name: 'Create review…', exact: true }).click();
  for (let index = 0; index < 2; index++) {
    await expect(page.getByTestId('goal-review-create-dialog')).toBeVisible();
    await page.locator('#goal-review-reflection').fill(`Reflection ${index + 1}`);
    await capture(page, `review-${index + 1}`);
    await page.getByTestId('goal-review-save').click();
    await expect(page.getByTestId('goal-review-inspect-dialog')).toBeVisible();
    await expect(page.getByTestId('goal-review-inspect-dialog')).toContainText(
      `Reflection ${index + 1}`,
    );
    await page.getByTestId('goal-review-inspect-close').click();
    if (!index) await page.getByRole('button', { name: 'Add review', exact: true }).click();
  }
  const evidence = await page.evaluate(() =>
    (window as unknown as { goalReferenceEvidence(): { calls: string[] } }).goalReferenceEvidence(),
  );
  expect(evidence.calls.filter((call) => call === 'record')).toHaveLength(1);
  expect(evidence.calls.filter((call) => call === 'review')).toHaveLength(2);
});

for (const withKr of [false, true]) {
  test(`production create ${withKr ? 'with KR' : 'empty'} aggregate`, async ({ page }) => {
    await open(page, 'state=create');
    await page.getByTestId('goal-name-input').fill('Created reference');
    if (withKr) {
      await page.getByTestId('add-key-result-entry').click();
      await page.getByTestId('draft-kr-title-input').fill('Reach measured outcome');
      await page.getByTestId('draft-kr-current-input').fill('4');
      await page.getByTestId('draft-kr-target-input').fill('10');
      await page.getByTestId('draft-kr-unit-input').fill('km');
      // Input focus may scroll the dialog; the baseline captures its top position.
      await page.getByTestId('product-dialog-body').evaluate((element) => element.scrollTo(0, 0));
      await capture(page, 'create-with-kr');
      await page.getByTestId('save-key-result-draft').click();
    }
    await page.getByTestId('save-goal-button').click();
    await expect(page.getByTestId('goal-dialog')).toHaveCount(0);
    await expect(page.getByTestId('goal-detail-title')).toHaveValue('Created reference');
    await expect(page.locator('[data-testid^="goal-kr-summary-"]')).toHaveCount(withKr ? 1 : 0);
  });
}
