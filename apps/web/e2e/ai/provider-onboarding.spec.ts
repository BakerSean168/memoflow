import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { registerAndLogin } from '../helpers/testHelpers';
import { TIMEOUT_CONFIG } from '../config';

const providerName = `E2E Agent ${Date.now()}`;
const baseUrl = process.env.E2E_AI_PROVIDER_BASE_URL!;
const keyV1 = process.env.E2E_AI_PROVIDER_KEY_V1!;
const keyV2 = process.env.E2E_AI_PROVIDER_KEY_V2!;
const acceptedKeyFile = process.env.E2E_AI_PROVIDER_ACCEPTED_KEY_FILE!;
const password = 'Test123456!';
async function providerCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const response = await fetch('/api/v1/ai/providers', { credentials: 'include' });
    if (!response.ok) throw new Error(`provider list failed: ${response.status}`);
    const body = await response.json();
    return body.data?.data?.length ?? -1;
  });
}
async function selectModel(page: Page, name: RegExp) {
  await page.getByTestId('ai-default-model').click();
  await page.getByRole('option', { name }).click();
}

test('[P0] T3 Agent wizard and inline Endpoint/Key configure the persistent composer without a browser refresh', async ({
  page,
}, testInfo) => {
  await registerAndLogin(page, {
    email: `e2e-parity-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
    password,
  });
  await page.goto('/settings?tab=ai', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ai-settings-panel')).toBeVisible({
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await expect(page.getByTestId('ai-provider-toggle-mastra')).toBeVisible();
  await expect(page.getByTestId('ai-provider-detail-toggle')).toBeVisible();
  expect(await providerCount(page)).toBe(0);
  await page.getByTestId('ai-provider-add').click();
  const dialog = page.getByTestId('ai-agent-wizard');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('ai-provider-catalog-codex')).toHaveCount(0);
  await expect(page.getByTestId('ai-provider-catalog-openrouter')).toHaveCount(0);
  await dialog.screenshot({
    path: testInfo.outputPath('agent-wizard-1.png'),
    animations: 'disabled',
  });
  await page.getByTestId('ai-provider-catalog-mastra').click();
  await page.getByTestId('ai-instance-continue').click();
  await page.getByTestId('ai-instance-name').fill(providerName);
  await page.getByTestId('ai-instance-slug').fill('mastra-parity');
  await dialog.screenshot({
    path: testInfo.outputPath('agent-wizard-2.png'),
    animations: 'disabled',
  });
  await page.getByTestId('ai-instance-continue').click();
  await expect(dialog.getByTestId('ai-api-key')).toHaveCount(0);
  await dialog.screenshot({
    path: testInfo.outputPath('agent-wizard-3.png'),
    animations: 'disabled',
  });
  await page.getByTestId('ai-agent-instance-save').click();
  const detail = page.getByTestId('ai-mastra-instance-detail');
  await expect(detail.getByTestId('ai-mastra-agent-name')).toHaveValue(providerName);
  expect(await providerCount(page)).toBe(0);
  // Reload proves credential-free creation was genuinely persisted before setup.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('ai-provider-select-agent:mastra-parity').click();
  await expect(detail.getByTestId('ai-mastra-agent-id')).toHaveValue('mastra-parity');
  await expect(page.getByTestId('ai-provider-onboarding')).toHaveCount(0);
  await page.getByTestId('ai-endpoint').fill(baseUrl);
  await page.getByTestId('ai-api-key').fill(keyV1);
  await page.getByTestId('ai-connection-verify').click();
  await expect(page.getByTestId('ai-default-model')).toBeVisible();
  await expect(page.getByTestId('ai-api-key')).toHaveValue('');
  expect(await providerCount(page)).toBe(0);
  await selectModel(page, /E2E Model Alpha/);
  await page.getByTestId('ai-mastra-connection-save').click();
  await expect(detail.getByTestId('ai-mastra-status')).toContainText(/已配置|configured/i);
  expect(await providerCount(page)).toBe(1);
  await expect(detail).not.toContainText(keyV1);

  // Connection replacement uses the same inline inputs; no vendor picker,
  // duplicated Agent, or credential-bearing AgentInstance metadata is allowed.
  writeFileSync(acceptedKeyFile, `${keyV1}\n${keyV2}\n`);
  await page.getByTestId('ai-api-key').fill(keyV2);
  await page.getByTestId('ai-connection-verify').click();
  await expect(page.getByTestId('ai-api-key')).toHaveValue('');
  await selectModel(page, /E2E Model Beta/);
  await page.getByTestId('ai-mastra-connection-save').click();
  await expect(page.getByTestId('ai-default-model')).toContainText(/Beta/);
  expect(await providerCount(page)).toBe(1);
  writeFileSync(acceptedKeyFile, `${keyV2}\n`);
  const results = await page.evaluate(async () => {
    const providers = await fetch('/api/v1/ai/providers', { credentials: 'include' }).then(
      (response) => response.json(),
    );
    const providerId = providers.data.data[0].id;
    const refresh = await fetch(`/api/v1/ai/providers/${providerId}/refresh-models`, {
      method: 'POST',
      credentials: 'include',
    });
    const check = await fetch('/api/v1/ai/providers/test', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId }),
    });
    return { refresh: refresh.status, check: check.status, body: await check.json() };
  });
  expect(results.refresh).toBe(200);
  expect(results.check).toBe(200);
  expect(JSON.stringify(results.body)).not.toContain(keyV1);
  expect(JSON.stringify(results.body)).not.toContain(keyV2);

  // A different advertised model can become this Agent's default without
  // re-entering a key or changing a shared model-service default.
  await selectModel(page, /E2E Model Alpha/);
  await page.getByTestId('ai-mastra-connection-save').click();
  await expect(page.getByTestId('ai-default-model')).toContainText(/Alpha/);
  const defaults = await page.evaluate(async () => {
    const [providers, agents] = await Promise.all([
      fetch('/api/v1/ai/providers', { credentials: 'include' }).then((response) => response.json()),
      fetch('/api/v1/ai/agent-instances', { credentials: 'include' }).then((response) =>
        response.json(),
      ),
    ]);
    return {
      serviceModel: providers.data.data[0].defaultModel,
      agentModel: agents.data.bindings.find(
        (binding: { instanceId: string }) => binding.instanceId === 'mastra-parity',
      ).modelId,
    };
  });
  expect(defaults).toEqual({ serviceModel: 'e2e-model-beta', agentModel: 'e2e-model-alpha' });

  for (const theme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [1600, 1280, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await expect(page.getByTestId('ai-provider-recheck')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      if (width >= 1280) {
        const list = await page.getByTestId('ai-provider-list').boundingBox();
        const current = await detail.boundingBox();
        expect(current!.x).toBeGreaterThan(list!.x + list!.width);
      }
      await page.getByTestId('ai-settings-panel').screenshot({
        path: testInfo.outputPath(`providers-${theme}-${width}.png`),
        animations: 'disabled',
        style: '[data-sonner-toaster] { visibility: hidden !important; }',
      });
    }
  }
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.emulateMedia({ colorScheme: 'dark' });
  // A page-global marker catches accidental page.goto()/reload masking the bug.
  await page.evaluate(() => {
    (window as unknown as { __agentParityMarker: string }).__agentParityMarker =
      'same-mounted-application';
  });
  await page.getByTestId('settings-return-to-app').first().click();
  await expect(page.getByTestId('ai-chat-agent-selector')).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __agentParityMarker: string }).__agentParityMarker,
    ),
  ).toBe('same-mounted-application');
  await page.getByTestId('ai-chat-agent-selector').click();
  await page.getByRole('option').filter({ hasText: providerName }).click();
  await page.getByTestId('ai-chat-model-selector').click();
  await expect(page.getByRole('option', { name: 'E2E Model Alpha', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'E2E Model Beta', exact: true })).toBeVisible();
  await page.getByRole('option', { name: 'E2E Model Beta', exact: true }).click();
  await page.getByTestId('ai-chat-permission-selector').click();
  await page
    .getByRole('option')
    .filter({ hasText: /只读|Read only/i })
    .click();
  await expect(page.getByTestId('ai-chat-permission-selector')).toContainText(/只读|Read only/i);
  const composer = page.getByTestId('ai-composer-surface');
  await composer.screenshot({
    path: testInfo.outputPath('composer-three-controls.png'),
    animations: 'disabled',
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByTestId('ai-chat-agent-selector')).toBeVisible();
    await expect(page.getByTestId('ai-chat-model-selector')).toBeVisible();
    await expect(page.getByTestId('ai-chat-permission-selector')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.getByTestId('ai-chat-agent-selector').click();
  await page
    .getByRole('option')
    .filter({ hasText: /配置 Agent|Configure Agent/ })
    .click();
  const aiTab = page.getByTestId('settings-tab-ai');
  if (await aiTab.count()) await aiTab.first().click();
  await page.getByTestId('ai-provider-toggle-mastra-parity').click();
  await expect(page.getByTestId('ai-provider-toggle-mastra-parity')).not.toBeChecked();
  await page.getByTestId('settings-return-to-app').first().click();
  await expect(page.getByTestId('ai-chat-model-selector')).toContainText(/未配置|Not configured/i);
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

test('[opt-in] direct compatible Endpoint credential and live catalogue', async ({ page }) => {
  const endpoint = process.env.E2E_MODEL_SERVICE_BASE_URL?.trim();
  const key = process.env.E2E_MODEL_SERVICE_API_KEY?.trim();
  test.skip(
    !endpoint || !key,
    'Provide an explicit Endpoint and Key to opt in to a real provider test.',
  );
  await registerAndLogin(page, { email: `e2e-compatible-${Date.now()}@test.com`, password });
  await page.goto('/settings?tab=ai', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('ai-endpoint').fill(endpoint!);
  await page.getByTestId('ai-api-key').fill(key!);
  await page.getByTestId('ai-connection-verify').click();
  await expect(page.getByTestId('ai-default-model')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('ai-api-key')).toHaveValue('');
  expect(await providerCount(page)).toBe(0);
  await page.getByTestId('ai-mastra-connection-save').click();
  await expect(page.getByTestId('ai-mastra-status')).toContainText(/configured|已配置/i);
  expect(await providerCount(page)).toBe(1);
});
