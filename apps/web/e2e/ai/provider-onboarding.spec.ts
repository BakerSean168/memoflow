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
  // #457: the enable Switch is unique to the left provider list item; the right-side duplicate was removed and must not return.
  await expect(page.getByTestId('ai-provider-detail-toggle')).toHaveCount(0);
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
  // The selector displays the draft before the asynchronous Registry bind finishes.
  // Wait for the real save acknowledgement so this assertion cannot race the API.
  await expect(page.getByTestId('ai-mastra-save-confirmation')).toBeVisible();
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
  await expect(page.getByTestId('ai-chat-model-selector')).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __agentParityMarker: string }).__agentParityMarker,
    ),
  ).toBe('same-mounted-application');
  await page.getByTestId('ai-chat-model-selector').click();
  await expect(page.getByTestId('ai-model-picker')).toBeVisible();
  await expect(
    page.getByTestId('ai-model-picker-option').filter({ hasText: 'E2E Model Alpha' }),
  ).toBeVisible();
  await expect(
    page.getByTestId('ai-model-picker-option').filter({ hasText: 'E2E Model Beta' }),
  ).toBeVisible();
  // Measure after the opening zoom animation; retain strict geometry assertions.
  await expect
    .poll(async () => (await page.getByTestId('ai-model-picker').boundingBox())?.width ?? 0)
    .toBeCloseTo(360, 1);
  const filledBox = await page.getByTestId('ai-model-picker').boundingBox();
  await page.getByTestId('ai-model-picker-agent-agent:mastra').click();
  await expect(page.getByTestId('ai-model-picker-empty')).toContainText(
    /此 Provider 暂无可用模型|No models are available for this provider/,
  );
  await expect(page.getByTestId('ai-model-picker-empty-settings')).toContainText(
    /打开 Provider 设置|Open provider setup/,
  );
  const emptyProviderBox = await page.getByTestId('ai-model-picker').boundingBox();
  expect(Math.abs(emptyProviderBox!.width - filledBox!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(emptyProviderBox!.height - filledBox!.height)).toBeLessThanOrEqual(1);
  await page.getByTestId('ai-model-picker-agent-agent:mastra-parity').click();
  await page.getByTestId('ai-model-picker-search').fill('Model Beta');
  await expect(page.getByTestId('ai-model-picker-option')).toHaveCount(1);
  await expect(page.getByTestId('ai-model-picker-option')).toContainText(providerName);
  await page.getByTestId('ai-model-picker-toggle-favorite').click();
  await expect(page.getByTestId('ai-chat-model-selector')).not.toContainText('E2E Model Beta');
  await page.getByTestId('ai-model-picker-option').click();
  await expect(page.getByTestId('ai-chat-model-selector')).toContainText('E2E Model Beta');
  // Real API + fixture inference: two Mastra instances share one product conversation.
  const registryBeforeSwitch = (await (await page.request.get('/api/v1/ai/agent-instances')).json())
    .data;
  const master = registryBeforeSwitch.instances.find(
    (instance: { instanceId: string }) => instance.instanceId === 'mastra',
  );
  const providerId = registryBeforeSwitch.bindings.find(
    (binding: { instanceId: string }) => binding.instanceId === 'mastra-parity',
  ).connectionId;
  const boundMaster = await page.request.post('/api/v1/ai/agent-instances', {
    data: {
      action: 'bind',
      instanceId: 'mastra',
      expectedRevision: master.revision,
      connectionId: providerId,
      modelId: 'e2e-model-alpha',
    },
  });
  expect(boundMaster.ok()).toBe(true);
  await page.goto('/settings?tab=ai');
  await expect(page.getByTestId('ai-provider-list')).toBeVisible();
  await page.getByTestId('settings-return-to-app').first().click();
  // #481: browse a second enabled instance without changing selection or sending.
  await page.getByTestId('ai-chat-composer').fill('Draft survives browsing');
  await page.getByTestId('ai-chat-model-selector').click();
  await page.getByTestId('ai-model-picker-agent-agent:mastra').click();
  await expect(page.getByTestId('ai-model-picker-option')).toHaveCount(2);
  await expect(page.getByTestId('ai-chat-model-selector')).toContainText('E2E Model Beta');
  await expect(page.getByTestId('ai-chat-composer')).toHaveValue('Draft survives browsing');
  await expect(page.getByTestId('ai-model-picker-select-agent')).toHaveCount(0);
  await page.getByTestId('ai-model-picker-option').filter({ hasText: 'E2E Model Alpha' }).click();
  await expect(page.getByTestId('ai-chat-model-selector')).toContainText('E2E Model Alpha');
  // Favorite belongs to mastra-parity. Disable it via the real Settings switch.
  await page.goto('/settings?tab=ai');
  await page.getByTestId('ai-provider-toggle-mastra-parity').click();
  await expect(page.getByTestId('ai-provider-toggle-mastra-parity')).not.toBeChecked();
  await expect(page.getByTestId('ai-provider-select-agent:mastra-parity')).toBeVisible();
  await page.getByTestId('settings-return-to-app').first().click();
  await page.getByTestId('ai-chat-model-selector').click();
  await expect(page.getByTestId('ai-model-picker-agent-agent:mastra-parity')).toHaveCount(0);
  await page.getByTestId('ai-model-picker-favorites').click();
  await expect(page.getByTestId('ai-model-picker-option')).toHaveCount(0);
  await page.getByTestId('ai-model-picker-search').fill(providerName);
  await expect(page.getByTestId('ai-model-picker-option')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('ai-model-picker-option')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/settings?tab=ai');
  await page.getByTestId('ai-provider-toggle-mastra-parity').click();
  await expect(page.getByTestId('ai-provider-toggle-mastra-parity')).toBeChecked();
  await page.getByTestId('settings-return-to-app').first().click();
  await page.getByTestId('ai-chat-model-selector').click();
  await expect(page.getByTestId('ai-model-picker-agent-agent:mastra-parity')).toBeVisible();
  await page.getByTestId('ai-model-picker-favorites').click();
  await expect(page.getByTestId('ai-model-picker-option')).toHaveCount(1);
  await expect(page.getByTestId('ai-model-picker-option')).toContainText('E2E Model Beta');
  await page.getByTestId('ai-model-picker-option').click();
  await expect(page.getByTestId('ai-chat-model-selector')).toContainText('E2E Model Beta');
  const firstTurn = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/ai/runtime/assistant/sse'),
  );
  let releaseFirstTurn!: () => void;
  const firstTurnGate = new Promise<void>((resolve) => {
    releaseFirstTurn = resolve;
  });
  await page.route(
    '**/ai/runtime/assistant/sse',
    async (route) => {
      await firstTurnGate;
      await route.continue();
    },
    { times: 1 },
  );
  await page.getByTestId('ai-chat-composer').fill('First turn with Beta');
  await page.getByTestId('ai-chat-send-message').click();
  const conversationId = (await firstTurn).postDataJSON().conversationId;
  try {
    await expect(
      page
        .getByTestId('conversation-sidebar')
        .locator(`button[data-keyboard-item="${conversationId}"]`)
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText('E2E provider connection OK (e2e-model-beta)', { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('conversation-created-before-reply.png') });
  } finally {
    releaseFirstTurn();
  }
  await expect(
    page.getByText('E2E provider connection OK (e2e-model-beta)', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('ai-chat-send-message')).toBeVisible();
  const firstActivity = (await (await page.request.get('/api/v1/ai/chat/conversations')).json())
    .data.data[0].updatedAt;
  await page.getByTestId('ai-chat-model-selector').click();
  await page.getByTestId('ai-model-picker-agent-agent:mastra').click();
  await page.getByTestId('ai-model-picker-option').filter({ hasText: 'E2E Model Alpha' }).click();
  await expect(
    page.getByText('E2E provider connection OK (e2e-model-beta)', { exact: true }),
  ).toBeVisible();
  const secondTurn = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/ai/runtime/assistant/sse'),
  );
  await page.getByTestId('ai-chat-composer').fill('Second turn with Alpha');
  await page.getByTestId('ai-chat-send-message').click();
  expect((await secondTurn).postDataJSON()).toMatchObject({
    conversationId,
    agentInstanceId: 'mastra',
    modelId: 'e2e-model-alpha',
  });
  await expect(
    page.getByText('E2E provider connection OK (e2e-model-alpha)', { exact: true }),
  ).toBeVisible();
  const latestSelection = await page.request.post('/api/v1/ai/agent-instances', {
    data: { action: 'conversation_selection', conversationId },
  });
  expect((await latestSelection.json()).data).toMatchObject({
    agentInstanceId: 'mastra',
    modelId: 'e2e-model-alpha',
  });
  const conversationList = await page.request.get('/api/v1/ai/chat/conversations');
  expect((await conversationList.json()).data.total).toBe(1);
  const afterSecondTurn = (await (await page.request.get('/api/v1/ai/chat/conversations')).json())
    .data.data[0];
  expect(afterSecondTurn.updatedAt).toBeGreaterThan(firstActivity);
  await page.route(
    '**/ai/runtime/assistant/sse',
    async (route) => {
      const failure = {
        eventId: 'e2e-failed-turn:1',
        runId: 'e2e-failed-turn',
        conversationId,
        sequence: 1,
        createdAt: Date.now(),
        type: 'assistant.run.failed',
        data: { code: 'AI_RUNTIME_TRANSPORT_ERROR', message: 'AI runtime request failed' },
      };
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `event: runtime\ndata: ${JSON.stringify(failure)}\n\n`,
      });
    },
    { times: 1 },
  );
  await page.getByTestId('ai-chat-composer').fill('Fixture provider failure');
  await page.getByTestId('ai-chat-send-message').click();
  await expect(
    page.getByText('本次回复未能完成，请重试或切换模型。', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('AI runtime request failed', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('ai-chat-send-message')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('localized-provider-failure.png') });
  await page.getByTestId('ai-chat-model-selector').click();
  await page.getByTestId('ai-model-picker-agent-agent:mastra-parity').click();
  await page.getByTestId('ai-model-picker-option').filter({ hasText: 'E2E Model Beta' }).click();
  const currentRegistry = (await (await page.request.get('/api/v1/ai/agent-instances')).json())
    .data;
  const masterRevision = currentRegistry.instances.find(
    (instance: { instanceId: string }) => instance.instanceId === 'mastra',
  ).revision;
  expect(
    (
      await page.request.post('/api/v1/ai/agent-instances', {
        data: {
          action: 'unbind',
          instanceId: 'mastra',
          expectedRevision: masterRevision,
          connectionId: providerId,
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/settings?tab=ai');
  await expect(page.getByTestId('ai-provider-list')).toBeVisible();
  await page.getByTestId('settings-return-to-app').first().click();
  await expect(page.getByTestId('ai-chat-model-selector')).toContainText('E2E Model Beta');
  // Mastra does not declare executable native traits; no inert UI should appear.
  await expect(page.getByTestId('ai-chat-traits-selector')).toHaveCount(0);
  await page.getByTestId('ai-chat-permission-selector').click();
  await page.getByTestId('ai-permission-option-read-only').click();
  await expect(page.getByTestId('ai-chat-permission-selector')).toContainText(/只读|Read only/i);
  const composer = page.getByTestId('ai-composer-surface');
  await composer.screenshot({
    path: testInfo.outputPath('composer-three-controls.png'),
    animations: 'disabled',
  });
  for (const width of [1440, 530, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByTestId('ai-chat-model-selector')).toBeVisible();
    await expect(page.getByTestId('ai-chat-traits-selector')).toHaveCount(0);
    await expect(page.getByTestId('ai-chat-permission-selector')).toBeVisible();
    await page.getByTestId('ai-chat-model-selector').click();
    const picker = page.getByTestId('ai-model-picker');
    await expect(picker).toBeVisible();
    // Popover enters with a zoom animation. Measure after it settles instead
    // of treating an in-flight transform as a change in the fixed dimensions.
    await expect
      .poll(async () => (await picker.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(359);
    const pickerBox = await picker.boundingBox();
    expect(pickerBox).not.toBeNull();
    expect(pickerBox!.x).toBeGreaterThanOrEqual(-1);
    expect(pickerBox!.y).toBeGreaterThanOrEqual(-1);
    expect(pickerBox!.x + pickerBox!.width).toBeLessThanOrEqual(width + 1);
    expect(pickerBox!.width).toBeGreaterThanOrEqual(350);
    expect(pickerBox!.height).toBeGreaterThanOrEqual(346);
    await expect(page.getByTestId('ai-model-picker-active-indicator')).toHaveCount(1);
    await expect(page.getByTestId('ai-model-picker-settings')).toHaveCount(0);
    const sidebar = page.getByTestId('ai-model-picker-sidebar');
    expect(
      await sidebar.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.overflowX === 'hidden' && style.scrollbarWidth === 'none';
      }),
    ).toBe(true);
    await page.getByTestId('ai-model-picker-search').fill('model-does-not-exist-999');
    await expect(page.getByTestId('ai-model-picker-empty')).toBeVisible();
    const emptyPickerBox = await picker.boundingBox();
    expect(emptyPickerBox).not.toBeNull();
    expect(Math.abs(emptyPickerBox!.width - pickerBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(emptyPickerBox!.height - pickerBox!.height)).toBeLessThanOrEqual(1);
    await page.getByTestId('ai-model-picker-search').fill('');
    await expect(page.getByTestId('ai-model-picker-option')).toHaveCount(2);
    if (width <= 530) {
      await picker.screenshot({
        path: testInfo.outputPath('model-picker-' + width + '.png'),
        animations: 'disabled',
      });
    }
    await page.getByTestId('ai-chat-permission-selector').click();
    await expect(picker).toBeHidden();
    const permissionPopup = page.getByTestId('ai-permission-picker');
    await expect(permissionPopup).toBeVisible();
    const permissionBox = await permissionPopup.boundingBox();
    expect(permissionBox).not.toBeNull();
    expect(permissionBox!.x).toBeGreaterThanOrEqual(-1);
    expect(permissionBox!.x + permissionBox!.width).toBeLessThanOrEqual(width + 1);
    if (width === 390) {
      await permissionPopup.screenshot({
        path: testInfo.outputPath('permission-picker-390.png'),
        animations: 'disabled',
      });
    }
    await page.keyboard.press('Escape');
    await expect(permissionPopup).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/settings?tab=ai', { waitUntil: 'domcontentloaded' });
  const aiTab = page.getByTestId('settings-tab-ai');
  if (await aiTab.count()) await aiTab.first().click();
  await page.getByTestId('ai-provider-toggle-mastra-parity').click();
  await expect(page.getByTestId('ai-provider-toggle-mastra-parity')).not.toBeChecked();
  await page.getByTestId('settings-return-to-app').first().click();
  // The built-in Mastra instance is still enabled but has no bound connection.
  // Keep the composer browsable so this remains distinct from “all providers disabled”.
  await expect(page.getByTestId('ai-chat-model-selector')).toBeVisible();
  await page.getByTestId('ai-chat-model-selector').click();
  await expect(page.getByTestId('ai-model-picker-empty')).toContainText(
    /暂无可用模型|No models are available/,
  );
  await expect(page.getByTestId('ai-chat-permission-selector')).toHaveCount(0);
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
