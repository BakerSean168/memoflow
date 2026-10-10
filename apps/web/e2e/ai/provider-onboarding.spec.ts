import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { registerAndLogin } from '../helpers/testHelpers';
import { TIMEOUT_CONFIG } from '../config';

const providerName = `E2E Secure Custom ${Date.now()}`;
const baseUrl = process.env.E2E_AI_PROVIDER_BASE_URL!;
const keyV1 = process.env.E2E_AI_PROVIDER_KEY_V1!;
const keyV2 = process.env.E2E_AI_PROVIDER_KEY_V2!;
const acceptedKeyFile = process.env.E2E_AI_PROVIDER_ACCEPTED_KEY_FILE!;
const password = 'Test123456!';

function button(page: Page, pattern: RegExp) {
  return page.getByRole('button', { name: pattern }).last();
}

async function providerCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/ai/providers', { credentials: 'include' });
    if (!response.ok) throw new Error(`provider list failed: ${response.status}`);
    const body = await response.json() as { data?: { data?: unknown[] } };
    return body.data?.data?.length ?? -1;
  });
}

async function selectModel(page: Page, modelId: string): Promise<void> {
  const row = page.getByTestId('ai-provider-model-list').getByText(modelId, { exact: true });
  await expect(row).toBeVisible();
  await row.click();
  await button(page, /继续|Continue/i).click();
}

test('[P0] Custom Provider add → atomic save → verified replacement uses the new encrypted key', async ({ page }, testInfo) => {
  const email = `e2e-ai-provider-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  await registerAndLogin(page, { email, password });
  await page.goto('/settings?tab=ai', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ai-settings-panel')).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
  await expect(page.getByTestId('ai-provider-empty')).toBeVisible();
  expect(await providerCount(page)).toBe(0);

  await page.getByTestId('ai-provider-add').click();
  await page.getByTestId('ai-provider-catalog-custom').click();
  await page.locator('#ai-provider-name').fill(providerName);
  await page.locator('#ai-provider-base-url').fill(baseUrl);
  await page.locator('#ai-provider-api-key').fill(keyV1);
  await page.getByTestId('ai-provider-probe').click();
  await expect(page.getByTestId('ai-provider-model-list')).toBeVisible();
  expect(await providerCount(page)).toBe(0); // successful probe is still side-effect free
  await selectModel(page, 'e2e-model-alpha');
  await page.getByTestId('ai-provider-commit').click();

  const list = page.getByTestId('ai-provider-list');
  await expect(list.getByText(providerName, { exact: true })).toBeVisible();
  const detail = page.getByTestId('ai-provider-detail');
  await expect(detail).toContainText('e2e-model-alpha');
  await expect(detail.getByTestId('ai-provider-credential-state')).toBeVisible();
  await expect(detail).not.toContainText('e2e****1111');
  expect(await providerCount(page)).toBe(1);

  // Replacement probe must accept V2 while V1 remains valid until atomic commit.
  writeFileSync(acceptedKeyFile, `${keyV1}\n${keyV2}\n`);
  await button(page, /更换连接|Replace connection/i).click();
  await expect(page.getByTestId('ai-provider-onboarding')).toBeVisible();
  await page.locator('#ai-provider-api-key').fill(keyV2);
  await page.getByTestId('ai-provider-probe').click();
  await expect(page.getByTestId('ai-provider-model-list')).toBeVisible();
  await selectModel(page, 'e2e-model-beta');
  await expect(page.getByTestId('ai-provider-replacement-preserved-metadata')).toBeVisible();
  await page.getByTestId('ai-provider-commit').click();

  await expect(detail).toContainText('e2e-model-beta');
  await expect(detail.getByTestId('ai-provider-credential-state')).toBeVisible();
  await expect(detail).not.toContainText('e2e****2222');
  expect(await providerCount(page)).toBe(1);

  // Upstream now revokes V1. Refresh and connection test can pass only if the
  // encrypted Provider secret was atomically replaced with V2.
  writeFileSync(acceptedKeyFile, `${keyV2}\n`);
  await button(page, /刷新模型|Refresh models/i).click();
  await expect(detail).toContainText(/模型列表已刷新|Provider models refreshed/i);
  await button(page, /测试连接|Test connection/i).click();
  await expect(detail).toContainText(/连接测试通过|Connection test passed/i);

  for (const theme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [1600, 1280]) {
      await page.setViewportSize({ width, height: 960 });
      await expect(page.getByTestId('ai-provider-recheck')).toBeVisible();
      await expect(page.getByTestId('ai-provider-add')).toHaveCSS('background-color', 'rgb(100, 105, 218)');
      const listBounds = await list.boundingBox();
      const detailBounds = await detail.boundingBox();
      expect(listBounds).not.toBeNull();
      expect(detailBounds!.x).toBeGreaterThan(listBounds!.x + listBounds!.width);
      await page.getByTestId('ai-settings-panel').screenshot({
        path: testInfo.outputPath(`providers-${theme}-${width}.png`), animations: 'disabled',
        style: '[data-sonner-toaster] { visibility: hidden !important; }',
      });
    }
  }
  await page.setViewportSize({ width: 375, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const composer = page.getByTestId('ai-composer-surface');
  await expect(composer).toBeVisible();
  const optionsBounds = await page.getByTestId('ai-composer-options').boundingBox();
  const actionsBounds = await page.getByTestId('ai-composer-actions').boundingBox();
  expect(optionsBounds).not.toBeNull();
  expect(actionsBounds!.x).toBeGreaterThan(optionsBounds!.x);
  await composer.screenshot({ path: testInfo.outputPath('composer-t3-dark.png'), animations: 'disabled' });

  await page.goto('/settings?tab=ai', { waitUntil: 'domcontentloaded' });
  const enabledSwitch = page.getByTestId('ai-provider-list').getByRole('switch');
  await expect(enabledSwitch).toBeChecked();
  await enabledSwitch.click();
  await expect(enabledSwitch).not.toBeChecked();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ai-chat-empty-models')).toBeVisible();
});

test('[opt-in] real OpenRouter credential → live catalog → explicit model → atomic save', async ({ page }) => {
  const openRouterKey = process.env.E2E_OPENROUTER_API_KEY?.trim();
  test.skip(!openRouterKey, 'Set E2E_OPENROUTER_API_KEY explicitly to run the real OpenRouter acceptance path.');

  const email = `e2e-openrouter-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  await registerAndLogin(page, { email, password });
  await page.goto('/settings?tab=ai', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ai-settings-panel')).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
  expect(await providerCount(page)).toBe(0);

  await page.getByTestId('ai-provider-add').click();
  await page.getByTestId('ai-provider-catalog-openrouter').click();
  await page.locator('#ai-provider-api-key').fill(openRouterKey!);
  await page.getByTestId('ai-provider-probe').click();

  const modelList = page.getByTestId('ai-provider-model-list');
  await expect(modelList).toBeVisible({ timeout: 30_000 });
  expect(await providerCount(page)).toBe(0);

  let selected = false;
  for (const recommended of ['google/gemini-2.5-flash', 'openai/gpt-4o-mini']) {
    const model = modelList.getByText(recommended, { exact: true });
    if (await model.isVisible().catch(() => false)) {
      await model.click();
      selected = true;
      break;
    }
  }
  if (!selected) {
    await modelList.locator('button').first().click();
  }
  await button(page, /继续|Continue/i).click();
  await page.getByTestId('ai-provider-commit').click();

  const list = page.getByTestId('ai-provider-list');
  await expect(list.getByText('OpenRouter', { exact: true })).toBeVisible();
  expect(await providerCount(page)).toBe(1);
});
