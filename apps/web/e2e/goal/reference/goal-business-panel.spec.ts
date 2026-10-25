import { expect, test } from '@playwright/test';

// Real native owner components, deterministic service doubles; not AI-provider or database E2E evidence.
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

/**
 * T3 (#605): Chromium-native keyboard/focus acceptance against production
 * components; no dispatchEvent('Tab'), DOM stubs, API or database dependencies.
 */
test.describe('Browser component interactions', () => {
  test('production editor traps native Tab and restores opener focus after Escape', async ({
    page,
  }) => {
    await page.goto('/?surface=t3&scenario=dialog');
    const opener = page.getByTestId('t3-open-editor');
    await opener.click();
    const editor = page.getByTestId('t3-editor');
    const draft = page.getByTestId('t3-draft');
    await expect(editor).toBeVisible();
    await expect(draft).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('t3-editor-next')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(draft).toBeFocused();
    await draft.fill('Keep this draft');
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('modal date-time picker keeps native Tab inside Portal and closes with Escape', async ({
    page,
  }) => {
    await page.goto('/?surface=t3&scenario=picker');
    const opener = page.getByTestId('t3-open-picker');
    await opener.click();
    const picker = page.getByTestId('t3-date-time-picker');
    await expect(picker).toBeVisible();
    for (let index = 0; index < 35; index += 1) {
      await page.keyboard.press('Tab');
      expect(await picker.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    }
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await picker.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('nested panel picker makes only the owning form inert and returns focus', async ({
    page,
  }) => {
    await page.goto('/?surface=t3&scenario=panel');
    await page.getByTestId('t3-open-editor').click();
    const editor = page.getByTestId('t3-editor');
    await expect(page.getByTestId('t3-draft')).toBeFocused();
    await page.getByTestId('t3-open-picker').click();
    const picker = page.getByTestId('t3-date-time-picker');
    await expect(picker).toBeVisible();
    await expect(editor.locator('..')).toHaveAttribute('inert', '');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() =>
      document.activeElement?.closest('[data-testid]')?.getAttribute('data-testid'),
    );
    expect(focused).not.toBe('t3-draft');
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(editor.locator('..')).not.toHaveAttribute('inert', '');
    await expect(editor).toBeVisible();
    await expect(page.getByTestId('t3-open-picker')).toBeFocused();
  });

  test('dropdown uses real native keyboard selection and does not lose trigger focus', async ({
    page,
  }) => {
    await page.goto('/?surface=t3&scenario=filter');
    const filter = page.getByTestId('t3-filter');
    await filter.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitemradio', { name: 'Active' })).toBeVisible();
    await page.getByRole('menuitemradio', { name: 'Active' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('t3-filter-value')).toHaveText('active');
    await expect(filter).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitemradio', { name: 'Active' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(filter).toBeFocused();
  });

  test('model picker excludes blocked agents under real ArrowDown and Enter navigation', async ({
    page,
  }) => {
    await page.goto('/?surface=t3&scenario=model');
    const trigger = page.getByTestId('ai-chat-model-selector');
    await trigger.click();
    const search = page.getByTestId('ai-model-picker-search');
    await expect(search).toBeFocused();
    await search.fill('Model');
    const rows = page.getByTestId('ai-model-picker-option');
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: 'Model Blocked' })).toBeDisabled();
    await page.keyboard.press('ArrowDown');
    await expect(rows.filter({ hasText: 'Model Alpha' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rows.filter({ hasText: 'Model Beta' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('t3-model-selection')).toContainText('model-b');
    await expect(page.getByTestId('ai-model-picker')).toHaveCount(0);
    await trigger.click();
    await search.fill('Blocked');
    await expect(rows).toHaveCount(1);
    await expect(rows).toBeDisabled();
    await search.focus();
    await page.keyboard.press('ArrowDown');
    await expect(search).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('t3-model-selection')).toContainText('model-b');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('ai-model-picker')).toHaveCount(0);
  });

  test('real Goal editor protects a dirty draft through Escape cancellation and explicit discard', async ({
    page,
  }) => {
    await page.goto('/?state=create&locale=en-US');
    const goal = page.getByTestId('goal-dialog');
    const title = page.getByTestId('goal-name-input');
    await expect(goal).toBeVisible();
    await expect(title).toBeFocused();
    await title.fill('Do not lose my unsaved goal');
    await page.keyboard.press('Escape');
    const confirm = page.getByTestId('global-confirm-dialog');
    await expect(confirm).toBeVisible();
    await page.getByTestId('global-confirm-cancel').click();
    await expect(confirm).toHaveCount(0);
    await expect(goal).toBeVisible();
    await expect(title).toHaveValue('Do not lose my unsaved goal');
    await title.focus();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeVisible();
    await page.getByTestId('global-confirm-confirm').click();
    await expect(goal).toHaveCount(0);
    const evidence = await page.evaluate(
      () =>
        (
          window as unknown as { goalReferenceEvidence(): { calls: string[] } }
        ).goalReferenceEvidence().calls,
    );
    expect(evidence).not.toContain('create');
  });

  test('task recurrence weekday and month-day controls work through native Tab, Space and Enter', async ({
    page,
  }) => {
    await page.goto('/?surface=t3&scenario=recurrence');
    await page.getByTestId('t3-before-weekdays').focus();
    await page.keyboard.press('Tab');
    const sunday = page.getByTestId('weekday-option-0');
    const monday = page.getByTestId('weekday-option-1');
    await expect(sunday).toBeFocused();
    await expect(sunday).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Space');
    await expect(sunday).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('t3-weekday-selection')).toHaveText('1,0');
    await page.keyboard.press('Tab');
    await expect(monday).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(monday).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('t3-weekday-selection')).toHaveText('0');
    const day = page.getByTestId('month-day-option-15');
    await day.focus();
    await page.keyboard.press('Space');
    await expect(day).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter');
    await expect(day).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('t3-month-day-selection')).toHaveText('15');
  });

  test('Goal deep links use real browser Back, Forward and reload without losing the KR route', async ({
    page,
  }) => {
    await page.goto('/t3-history/goals/goal-reference?filter=active#context');
    await expect(page.getByTestId('goal-detail-view')).toBeVisible();
    await page
      .getByTestId('goal-kr-summary-kr-0')
      .getByRole('button', { name: 'More', exact: true })
      .click();
    await page.getByTestId('goal-kr-detail-kr-0').click();
    await expect(page.getByTestId('goal-kr-inspect')).toBeVisible();
    await expect(page).toHaveURL(/\/t3-history\/goals\/goal-reference\/key-results\/kr-0/);
    await page.goBack();
    await expect(page.getByTestId('goal-kr-inspect')).toHaveCount(0);
    await expect(page.getByTestId('goal-detail-view')).toBeVisible();
    await page.goForward();
    await expect(page.getByTestId('goal-kr-inspect')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('goal-kr-inspect')).toBeVisible();
    const evidence = await page.evaluate(
      () =>
        (
          window as unknown as { goalReferenceEvidence(): { calls: string[] } }
        ).goalReferenceEvidence().calls,
    );
    expect(evidence).toContain('workspace');
  });
});
