import { expect, test } from '@playwright/test';
import { registerAndLogin } from '../helpers/testHelpers';

test('provider settings load and built-in reset retains identity', async ({ page }) => {
  await registerAndLogin(page, {
    email: `e2e-provider-states-${Date.now()}@test.com`,
    password: 'Test123456!',
  });
  await page.goto('/settings?tab=ai');
  const response = await page.request.get('/api/v1/ai/agent-instances');
  const body = await response.json();
  console.log(
    'Registry response',
    response.status(),
    body.ok,
    body.error ?? Object.keys(body.data ?? {}),
  );
  await expect(page.getByTestId('ai-provider-list')).toBeVisible();
  await expect(page.getByTestId('ai-agent-delete')).toHaveCount(0);
  await page.getByTestId('ai-provider-toggle-mastra').click();
  await expect(page.getByTestId('ai-provider-toggle-mastra')).not.toBeChecked();
  await expect(page.locator('header').getByTestId('ai-agent-reset')).toBeVisible();
  await page.getByTestId('ai-agent-reset').click();
  await expect(page.getByTestId('ai-provider-toggle-mastra')).toBeChecked();
  const restored = await page.request.get('/api/v1/ai/agent-instances');
  const snapshot = (await restored.json()).data;
  expect(snapshot.instances).toHaveLength(1);
  expect(snapshot.instances[0]).toMatchObject({
    instanceId: 'mastra',
    enabled: true,
    name: 'Mastra',
  });
  const removed = await page.request.post('/api/v1/ai/agent-instances', {
    data: {
      action: 'remove',
      instanceId: 'mastra',
      expectedRevision: snapshot.instances[0].revision,
    },
  });
  expect(removed.status()).toBe(409);
  await page.route('**/api/v1/ai/providers', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'fixture failure' },
      }),
    }),
  );
  await page.getByTestId('ai-provider-recheck').click();
  await expect(page.getByTestId('ai-provider-error')).toBeVisible();
  await expect(page.getByTestId('ai-provider-list')).toBeVisible();
  await expect(page.getByTestId('ai-endpoint')).toBeVisible();
});

test('empty enabled instances remain browsable after initialization with a stable setup state', async ({
  page,
}, testInfo) => {
  await registerAndLogin(page, {
    email: `e2e-provider-empty-${Date.now()}@test.com`,
    password: 'Test123456!',
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route('**/api/v1/ai/agent-instances', async (route) => {
    if (route.request().method() === 'GET') {
      requested = true;
      await gate;
    }
    await route.continue();
  });
  try {
    await page.goto('/');
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByTestId('ai-chat-model-selector')).toBeVisible();
    await expect(page.getByTestId('ai-composer-provider-unavailable')).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByTestId('ai-chat-model-selector')).toBeEnabled();
  await expect(page.getByTestId('ai-chat-permission-selector')).toHaveCount(0);
  await expect(page.getByTestId('ai-chat-traits-selector')).toHaveCount(0);
  await page.getByTestId('ai-chat-model-selector').click();
  await expect(page.getByTestId('ai-model-picker-agent-agent:mastra')).toBeVisible();
  await expect(page.getByTestId('ai-model-picker-empty')).toContainText(
    /暂无可用模型|No models are available/,
  );
  await expect(page.getByTestId('ai-model-picker-select-agent')).toHaveCount(0);
  await page
    .getByTestId('ai-model-picker')
    .screenshot({ path: testInfo.outputPath('empty-providers.png') });
  await page.getByTestId('ai-model-picker-empty-settings').click();
  await expect(page.getByTestId('ai-provider-list')).toBeVisible();
});
