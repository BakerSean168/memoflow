import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

test('T3 segments, persistence, and same-thread native command approval', async ({ page }) => {
  const evidence = process.env.RUNTIME_PERMISSION_EVIDENCE_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });
  const shot = async (name: string) => {
    if (evidence) await page.screenshot({ path: join(evidence, `${name}.png`) });
  };
  await page.goto('/');
  await page.getByTestId('ai-chat-model-selector').click();
  const button = page.getByTestId('ai-model-picker-permissions');
  await expect(button).toContainText('Supervised');
  await shot('01-footer-and-traits');
  await button.click();
  const menu = page.getByTestId('ai-model-picker-permissions-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('radio')).toHaveCount(3);
  await expect(menu.getByRole('radio', { name: 'Auto', exact: true })).toHaveCount(0);
  await shot('02-permissions-open');
  await page.getByTestId('ai-model-picker-permission-auto-accept-edits').hover();
  await expect(page.getByTestId('ai-permission-preview')).toContainText(
    'Auto-approve edits, ask before other actions.',
  );
  await shot('03-hover-preview');
  await page.getByTestId('ai-model-picker-permission-full-access').click();
  await expect(button).toContainText('Full access');
  await button.click();
  await expect(page.getByTestId('ai-model-picker-permission-full-access')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await shot('04-full-access-selected');
  await page.getByTestId('ai-chat-model-selector').click();
  await expect(page.getByTestId('ai-model-picker')).not.toBeVisible();
  await page.reload();
  await page.getByTestId('ai-chat-model-selector').click();
  await expect(button).toContainText('Full access');
  await page.getByTestId('ai-chat-model-selector').click();
  for (const control of ['switch-thread', 'switch-profile']) {
    await page.getByTestId(control).click();
    await page.getByTestId('ai-chat-model-selector').click();
    await expect(button).toContainText('Supervised');
    await page.getByTestId('ai-chat-model-selector').click();
    await page.getByTestId(control).click();
    await page.getByTestId('ai-chat-model-selector').click();
    await expect(button).toContainText('Full access');
    await page.getByTestId('ai-chat-model-selector').click();
  }
  await page.getByTestId('ai-chat-model-selector').click();
  await button.click();
  await page.getByTestId('ai-model-picker-permission-approval-required').click();
  await page.getByTestId('ai-chat-model-selector').click();
  await expect(page.getByTestId('ai-model-picker')).not.toBeVisible();
  const conversationId = await page.getByTestId('conversation').textContent();
  await page.getByTestId('run-command').click();
  await expect(page.getByTestId('ai-native-request')).toBeVisible();
  await expect(page.getByTestId('runtime-log')).not.toContainText(
    '"content": "runtime-861-command-executed',
  );
  await shot('05-supervised-command-approval');
  // The production request card sends its ordinary approve-once response.
  await page
    .getByTestId('ai-native-request')
    .getByRole('button', { name: /Allow once|Approve once|允许一次|仅本次/i })
    .click();
  await expect(page.getByTestId('runtime-log')).toContainText('runtime-861-command-executed');
  await expect(page.getByTestId('run-command')).toBeEnabled();
  const supervised = await page.request.get('/__runtime/state').then((result) => result.json());
  await page.getByTestId('ai-chat-model-selector').click();
  await button.click();
  await page.getByTestId('ai-model-picker-permission-full-access').click();
  await page.getByTestId('ai-chat-model-selector').click();
  await expect(page.getByTestId('ai-model-picker')).not.toBeVisible();
  await page.getByTestId('run-command').click();
  await expect
    .poll(async () => {
      const state = await page.request.get('/__runtime/state').then((result) => result.json());
      return (
        !state.running &&
        state.events[0]?.runId !== supervised.events[0].runId &&
        state.events.some((event: { type: string }) => event.type === 'assistant.run.completed')
      );
    })
    .toBe(true);
  const fullRunId = await page.request
    .get('/__runtime/state')
    .then((result) => result.json())
    .then((state) => state.events[0].runId);
  await expect(page.getByTestId('runtime-log')).toContainText(fullRunId);
  await expect(page.getByTestId('runtime-log')).toContainText('runtime-861-command-executed');
  await expect(page.getByTestId('run-command')).toBeEnabled();
  await expect(page.getByTestId('ai-native-request')).toHaveCount(0);
  await expect(page.getByTestId('conversation')).toHaveText(conversationId!);
  const fullAccess = await page.request.get('/__runtime/state').then((result) => result.json());
  expect(
    fullAccess.events.some(
      (event: { type: string }) => event.type === 'assistant.request.required',
    ),
  ).toBe(false);
  expect(
    supervised.events.some(
      (event: { type: string }) => event.type === 'assistant.request.required',
    ),
  ).toBe(true);
  await shot('06-full-access-command-without-approval');
  if (evidence)
    await writeFile(
      join(evidence, 'same-session-runtime-events.json'),
      JSON.stringify(
        {
          peer: 'Pi RPC peer runs the actual production tool_call extension and a real bounded Node command; no provider inference',
          supervised,
          fullAccess,
        },
        null,
        2,
      ),
    );
});

test('Mastra has no runtime permission control', async ({ page }) => {
  await page.goto('/?runtime=mastra');
  await page.getByTestId('ai-chat-model-selector').click();
  await expect(page.getByTestId('ai-model-picker')).toBeVisible();
  await expect(page.getByTestId('ai-model-picker-permissions')).toHaveCount(0);
  await expect(page.getByTestId('ai-model-picker-permissions-menu')).toHaveCount(0);
  const evidence = process.env.RUNTIME_PERMISSION_EVIDENCE_DIR;
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: join(evidence, '07-mastra-no-runtime-permission.png') });
  }
});
