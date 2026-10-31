import { expect, test } from '@playwright/test';

test('mouse range, disjoint and cross-group selection; context counts and keyboard focus', async ({
  page,
}) => {
  await page.goto('/');
  const row = (id: string) => page.locator(`[data-keyboard-item="${id}"]`);
  await row('a').click();
  await expect(page.getByTestId('opened')).toHaveText('a');
  await row('d').click({ modifiers: ['Shift'] });
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(2);
  await expect(page.getByTestId('opened')).toHaveText('a');
  await row('b').click({ modifiers: ['Control'] });
  await row('a').click({ modifiers: ['Meta'] });
  await expect(row('b')).toHaveAttribute('aria-selected', 'true');
  await expect(row('a')).toHaveAttribute('aria-selected', 'false');
  await row('d').click({ button: 'right' });
  await expect(page.getByTestId('conversation-context-status')).toHaveText('Archive (2)');
  await expect(page.getByTestId('conversation-context-delete')).toHaveText('Delete (2)');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await row('c').click({ button: 'right' });
  // 单个会话的右键菜单不带数量（T3 Code 同款），多选时才显示数量。
  await expect(page.getByTestId('conversation-context-status')).toHaveText('Archive');
  await page.keyboard.press('Escape');
  await expect(row('c')).toBeFocused();
  await row('b').focus();
  await page.keyboard.press('Escape');
  await row('b').focus();
  await page.keyboard.press('x');
  await expect(row('b')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Shift+J');
  await expect(row('a')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
  await row('b').click();
  await page.keyboard.press('ArrowDown');
  await expect(row('a')).toBeFocused();
  await page.keyboard.press('Shift+J');
  await expect(row('b')).toHaveAttribute('aria-selected', 'false');
  await expect(row('a')).toHaveAttribute('aria-selected', 'true');
  await expect(row('d')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('opened')).toHaveText('b');
  await page.keyboard.press('Escape');
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('palette')).toHaveText('true');
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('palette')).toHaveText('false');
});

test('partial failures remain selected, rapid actions serialize, and Ctrl+Z only restores successes', async ({
  page,
}) => {
  await page.goto('/?fail=1');
  const row = (id: string) => page.locator(`[data-keyboard-item="${id}"]`);
  for (const id of ['a', 'b', 'c', 'd']) await row(id).click({ modifiers: ['Control'] });
  await row('b').click({ button: 'right' });
  await expect(page.getByTestId('conversation-context-status')).toHaveText('Archive (4)');
  await page.getByTestId('conversation-context-status').click();
  await expect(page.getByTestId('conversation-bulk-results').locator('li')).toHaveCount(4);
  await expect(page.getByTestId('conversation-selection-count')).toHaveText('1 selected');
  await expect(page.locator('[data-keyboard-item="b"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('conversation-bulk-results')).toContainText(
    'Conversation B · Archive · Failed',
  );
  const editor = page.getByTestId('editor');
  await editor.fill('draft');
  await editor.press('Control+z');
  await expect(page.getByTestId('calls')).not.toContainText(':Active');
  await page.locator('[data-keyboard-item="b"]').focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('calls')).toContainText('d:Active');
  await expect(page.getByTestId('calls')).toContainText('c:Active');
  await expect(page.getByTestId('calls')).toContainText('a:Active');
  await expect(page.getByTestId('calls')).not.toContainText('b:Active');
  const calls = (await page.getByTestId('calls').textContent())!.split(',');
  expect(calls.filter((call) => call.endsWith(':Archived'))).toEqual([
    'b:Archived',
    'a:Archived',
    'd:Archived',
    'c:Archived',
  ]);
  expect(calls.filter((call) => call.endsWith(':Active')).sort()).toEqual([
    'a:Active',
    'c:Active',
    'd:Active',
  ]);
});

test('Profile switch drops old batch feedback and prevents subsequent writes and undo', async ({
  page,
}) => {
  await page.goto('/?hold=1');
  const row = (id: string) => page.locator(`[data-keyboard-item="${id}"]`);
  for (const id of ['a', 'b', 'c', 'd']) await row(id).click({ modifiers: ['Control'] });
  await row('b').click({ button: 'right' });
  await expect(page.getByTestId('conversation-context-status')).toHaveText('Archive (4)');
  await page.getByTestId('conversation-context-status').click();
  await page.getByTestId('switch-profile').click();
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
  await expect(page.getByTestId('conversation-bulk-results')).toHaveCount(0);
  await page.getByTestId('release-write').click();
  await expect(page.getByTestId('settled')).toHaveText('1');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('calls')).toHaveText('b:Archived');
});

test('narrow sidebar preserves search, blank clearing, recovery and separate destructive confirmation', async ({
  page,
}) => {
  await page.goto('/?narrow=1');
  await page.getByTestId('conversation-search-toggle').click();
  await page.getByTestId('conversation-search-input').fill('Conversation A');
  await page.locator('[data-keyboard-item="a"]').click({ modifiers: ['Control'] });
  await page.getByTestId('conversation-search-input').press('Escape');
  await expect(page.getByTestId('conversation-search-toggle')).toBeFocused();
  const nav = page.locator('nav');
  const navBox = (await nav.boundingBox())!;
  await nav.click({ position: { x: 100, y: navBox.height - 12 } });
  await expect(page.locator('[aria-selected="true"]')).toHaveCount(0);
  await page.locator('[data-keyboard-item="a"]').click({ modifiers: ['Control'] });
  await page.locator('[data-keyboard-item="a"]').click({ button: 'right' });
  await page.getByTestId('conversation-context-status').click();
  await expect(page.getByTestId('conversation-bulk-results')).toContainText('Succeeded');
  await page.getByTestId('conversation-archive-toggle').click();
  await page.locator('[data-keyboard-item="a"]').click({ button: 'right' });
  await expect(page.getByTestId('conversation-context-status')).toHaveText('Restore');
  await page.getByTestId('conversation-context-status').click();
  await expect(page.getByTestId('calls')).toContainText('a:Active');
  await page.getByTestId('conversation-archive-toggle').click();
  await expect(page.getByRole('listbox')).not.toHaveAttribute('aria-busy', 'true');
  await page.locator('[data-keyboard-item="a"]').click({ modifiers: ['Control'] });
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('cannot be undone');
    await dialog.dismiss();
  });
  await page.locator('[data-keyboard-item="a"]').click({ button: 'right' });
  await page.getByTestId('conversation-context-delete').click();
  await expect(page.getByTestId('calls')).not.toContainText(':Deleted');
  await expect(page.locator('[data-keyboard-item="a"]')).toHaveAttribute('aria-selected', 'true');
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.locator('[data-keyboard-item="a"]').click({ button: 'right' });
  await page.getByTestId('conversation-context-delete').click();
  await expect(page.getByTestId('calls')).toContainText('a:Deleted');
  const width = await page
    .getByTestId('conversation-sidebar')
    .evaluate((el) => ({ client: el.clientWidth, scroll: el.scrollWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});

test('single-conversation title menu preserves editor focus, Enter saves and Escape cancels', async ({
  page,
}) => {
  await page.goto('/');
  const row = page.locator('[data-keyboard-item="a"]');
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const input = page.getByTestId('conversation-title-input');
  await expect(input).toBeFocused();
  await input.fill('My manual title');
  await input.press('Enter');
  await expect(row).toHaveText('My manual title');
  await row.dblclick();
  await expect(input).toBeFocused();
  await input.fill('Discard this');
  await input.press('Escape');
  await expect(row).toHaveText('My manual title');
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Regenerate title', exact: true }).click();
  await expect(row).toHaveText('Readable topic from first message');
  await expect(page.locator('[data-keyboard-item="b"]')).toHaveText('Conversation B');
});

test('pending regeneration disables repeats while manual title input remains available', async ({
  page,
}) => {
  await page.goto('/?hold=1');
  const row = page.locator('[data-keyboard-item="a"]');
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Regenerate title', exact: true }).click();
  await row.click({ button: 'right' });
  await expect(
    page.getByRole('menuitem', { name: 'Generating title…', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByTestId('release-write').click();
  await expect(row).toHaveText('Readable topic from first message');
  await expect(page.getByTestId('calls')).toHaveText('a:GenerateTitle');
});

test('row actions stay hidden until hover or keyboard focus (T3 Code single slot)', async ({
  page,
}) => {
  await page.goto('/');
  const rowEl = page.getByTestId('conversation-row').filter({
    has: page.locator('[data-keyboard-item="b"]'),
  });
  const archive = rowEl.getByTestId('conversation-archive');
  await page.mouse.move(0, 0);
  await expect(archive).toHaveCSS('opacity', '0');
  await expect(archive).toHaveCSS('pointer-events', 'none');
  await expect(page.getByTestId('conversation-select-toggle')).toHaveCount(0);
  await rowEl.hover();
  await expect(archive).toHaveCSS('opacity', '1');
  await expect(archive).toHaveCSS('pointer-events', 'auto');
  await page.mouse.move(0, 0);
  await expect(archive).toHaveCSS('opacity', '0');
  await page.locator('[data-keyboard-item="b"]').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await expect(archive).toHaveCSS('opacity', '1');
});
