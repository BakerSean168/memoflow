import { expect, test } from '@playwright/test';

// Real native owner components, deterministic service doubles; not AI-provider or database E2E evidence.
test('right-panel Goal form uses a pane-scoped modeless dialog with the real native save contract', async ({
  page,
}) => {
  await page.goto('/?surface=panel&state=create&locale=en-US&theme=dark');
  const editor = page.getByTestId('goal-panel-form');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute('aria-modal', 'false');
  const backdrop = page.getByTestId('pane-scoped-dialog-backdrop');
  await expect(backdrop).toBeVisible();
  // A backdrop click is not a dismiss command. The chat pane is outside this scope.
  await backdrop.click({ position: { x: 3, y: 3 } });
  await expect(editor).toBeVisible();
  await expect(page.getByTestId('reference-goal-background')).toBeVisible();
  await page.getByTestId('reference-chat-composer').fill('Still typing while the editor is open');
  await expect(editor).toBeVisible();
  if (process.env.PANE_VISUAL_EVIDENCE === '1') {
    await page.screenshot({ path: '/home/dev/projects/.memoflow-goal-panel-reference.png' });
  }
  await expect(page.getByTestId('save-goal-button')).toBeDisabled();
  await page.getByTestId('goal-name-input').fill('Manual panel Goal');
  await page.getByTestId('save-goal-button').click();
  await expect(page.getByTestId('goal-panel-form')).toHaveCount(0);
  const evidence = await page.evaluate(() =>
    (
      window as unknown as {
        goalReferenceEvidence: () => { calls: string[]; goal: { name: string } };
      }
    ).goalReferenceEvidence(),
  );
  expect(evidence.calls.filter((call) => call === 'create')).toHaveLength(1);
  expect(evidence.goal.name).toBe('Manual panel Goal');
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
