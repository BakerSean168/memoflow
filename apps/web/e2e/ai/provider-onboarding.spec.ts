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
    const body = (await response.json()) as { data?: { data?: unknown[] } };
    return body.data?.data?.length ?? -1;
  });
}

async function selectModel(page: Page, modelId: string): Promise<void> {
  const row = page.getByTestId('ai-provider-model-list').getByText(modelId, { exact: true });
  await expect(row).toBeVisible();
  await row.click();
  await button(page, /继续|Continue/i).click();
}

test('[P0] Custom Provider add → atomic save → verified replacement uses the new encrypted key', async ({
  page,
}, testInfo) => {
  const email = `e2e-ai-provider-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  await registerAndLogin(page, { email, password });
  await page.goto('/settings?tab=ai', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ai-settings-panel')).toBeVisible({
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await expect(page.getByTestId('ai-mastra-needs-config')).toBeVisible();
  expect(await providerCount(page)).toBe(0);

  await page.getByTestId('ai-provider-add').click();
  await expect(page.getByTestId('ai-provider-catalog-codex')).toHaveCount(0);
  await expect(page.getByTestId('ai-provider-catalog-custom')).toHaveCount(0);
  await page.getByTestId('ai-provider-catalog-mastra').click();
  await page.locator('#ai-instance-name').fill(providerName);
  await page.getByTestId('ai-instance-continue').click();
  await page.getByTestId('ai-agent-instance-save').click();
  await expect(page.getByTestId('ai-mastra-instance-detail')).toContainText(providerName);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('ai-provider-list').getByText(providerName, { exact: true }).click();
  await expect(page.getByTestId('ai-mastra-instance-detail')).toContainText(providerName);
  expect(await providerCount(page)).toBe(0); // empty Agent survives refresh without credentials
  await page.getByTestId('ai-mastra-create-service').click();
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
  const detail = page.getByTestId('ai-mastra-instance-detail');
  await expect(detail).toContainText('e2e-model-alpha');
  await expect(detail.getByRole('button', { name: /更换连接|Replace connection/i })).toBeVisible();
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
  await expect(detail.getByRole('button', { name: /更换连接|Replace connection/i })).toBeVisible();
  await expect(detail).not.toContainText('e2e****2222');
  expect(await providerCount(page)).toBe(1);

  // Real API + encrypted SecretVault, with a local HTTPS model-service fixture.
  // The upstream fixture revokes V1; subsequent calls must resolve V2 from the vault.
  writeFileSync(acceptedKeyFile, `${keyV2}\n`);
  const connectionId = await page.evaluate(async () => {
    const response = await fetch('/api/v1/ai/providers', { credentials: 'include' });
    const body = await response.json();
    return body.data.data[0].id as string;
  });
  const results = await page.evaluate(async (providerId) => {
    const refresh = await fetch(`/api/v1/ai/providers/${providerId}/refresh-models`, {
      method: 'POST',
      credentials: 'include',
    });
    const test = await fetch('/api/v1/ai/providers/test', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId }),
    });
    return { refresh: refresh.status, test: test.status, testBody: await test.json() };
  }, connectionId);
  expect(results.refresh).toBe(200);
  expect(results.test).toBe(200);
  expect(JSON.stringify(results.testBody)).not.toContain(keyV1);
  expect(JSON.stringify(results.testBody)).not.toContain(keyV2);

  for (const theme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [1600, 1280]) {
      await page.setViewportSize({ width, height: 960 });
      await expect(page.getByTestId('ai-provider-recheck')).toBeVisible();
      await expect(page.getByTestId('ai-provider-add')).toHaveCSS(
        'background-color',
        'rgb(100, 105, 218)',
      );
      const listBounds = await list.boundingBox();
      const detailBounds = await detail.boundingBox();
      expect(listBounds).not.toBeNull();
      expect(detailBounds!.x).toBeGreaterThan(listBounds!.x + listBounds!.width);
      await page.getByTestId('ai-settings-panel').screenshot({
        path: testInfo.outputPath(`providers-${theme}-${width}.png`),
        animations: 'disabled',
        style: '[data-sonner-toaster] { visibility: hidden !important; }',
      });
    }
  }
  await page.setViewportSize({ width: 375, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const composer = page.getByTestId('ai-composer-surface');
  await expect(composer).toBeVisible();
  const optionsBounds = await page.getByTestId('ai-composer-options').boundingBox();
  const actionsBounds = await page.getByTestId('ai-composer-actions').boundingBox();
  expect(optionsBounds).not.toBeNull();
  expect(actionsBounds!.x).toBeGreaterThan(optionsBounds!.x);
  await composer.screenshot({
    path: testInfo.outputPath('composer-t3-dark.png'),
    animations: 'disabled',
  });

  await page.goto('/settings?tab=ai', { waitUntil: 'domcontentloaded' });
  const enabledSwitch = page
    .getByTestId('ai-provider-list')
    .getByRole('listitem')
    .filter({ hasText: providerName })
    .getByRole('switch');
  await expect(enabledSwitch).toBeChecked();
  await enabledSwitch.click();
  await expect(enabledSwitch).not.toBeChecked();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ai-chat-empty-models')).toBeVisible();
});

test('[P0] Agent Registry rejects native Web drivers, stale revisions and cross-owner mutation', async ({
  page,
}) => {
  await registerAndLogin(page, { email: `e2e-registry-a-${Date.now()}@test.com`, password });
  await page.goto('/settings?tab=ai', { waitUntil: 'domcontentloaded' });
  const first = await page.evaluate(async () => {
    const command = async (body: unknown) => {
      const response = await fetch('/api/v1/ai/agent-instances', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return response.status;
    };
    const instance = {
      instanceId: 'mastra-owner-test',
      driver: 'mastra',
      name: 'Owner test',
      accentColor: '#6469da',
      enabled: true,
    };
    return {
      native: await command({
        action: 'create',
        instance: { ...instance, instanceId: 'codex-work', driver: 'codex' },
      }),
      create: await command({ action: 'create', instance }),
      stale: await command({
        action: 'update',
        instanceId: instance.instanceId,
        expectedRevision: 0,
        patch: { name: 'Stale' },
      }),
    };
  });
  expect(first).toEqual({ native: 403, create: 200, stale: 409 });
  await registerAndLogin(page, { email: `e2e-registry-b-${Date.now()}@test.com`, password });
  await page.goto('/settings?tab=ai', { waitUntil: 'domcontentloaded' });
  const second = await page.evaluate(async () => {
    const list = await fetch('/api/v1/ai/agent-instances', { credentials: 'include' });
    const remove = await fetch('/api/v1/ai/agent-instances', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'remove',
        instanceId: 'mastra-owner-test',
        expectedRevision: 1,
      }),
    });
    return { snapshot: await list.json(), remove: remove.status };
  });
  expect(second.remove).toBe(404);
  expect(JSON.stringify(second.snapshot)).not.toContain('mastra-owner-test');
});

test('[opt-in] real OpenRouter credential → live catalog → explicit model → atomic save', async ({
  page,
}) => {
  const openRouterKey = process.env.E2E_OPENROUTER_API_KEY?.trim();
  test.skip(
    !openRouterKey,
    'Set E2E_OPENROUTER_API_KEY explicitly to run the real OpenRouter acceptance path.',
  );

  const email = `e2e-openrouter-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  await registerAndLogin(page, { email, password });
  await page.goto('/settings?tab=ai', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ai-settings-panel')).toBeVisible({
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  expect(await providerCount(page)).toBe(0);

  await page.getByTestId('ai-mastra-create-service').click();
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
