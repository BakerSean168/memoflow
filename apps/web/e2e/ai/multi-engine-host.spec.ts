/**
 * Historical filename retained from ADR-035.
 *
 * AI-vNext Batch B product regression: Web default open chat is a single
 * Mastra Assistant runtime. This Playwright path proves the browser talks to
 * the canonical runtime history/SSE surface and no longer exposes or sends the
 * legacy DirectTurn / pi_readonly product selector.
 *
 * It intentionally does not claim Electron runtime coverage.
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { TIMEOUT_CONFIG, WEB_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const e2ePassword = 'Test123456!';
const conversationId = 'conv-e2e-mastra-open-chat-1';
const providerId = 'provider-e2e-openai';
const modelId = 'gpt-4.1-mini';

const generateTestEmail = () =>
  `e2e-mastra-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;

async function fulfillJson(route: Route, data: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data }),
  });
}

async function fulfillRuntimeSse(
  route: Route,
  events: readonly Record<string, unknown>[],
): Promise<void> {
  const body = events.map((event) => `event: runtime\ndata: ${JSON.stringify(event)}\n\n`).join('');
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream; charset=utf-8',
    body,
    headers: {
      'cache-control': 'no-cache',
      'content-length': String(Buffer.byteLength(body, 'utf8')),
      connection: 'close',
    },
  });
}

type RuntimeMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
};

type MastraOpenChatCapture = {
  messageCommands: Array<Record<string, unknown>>;
  historyRequests: Array<Record<string, unknown>>;
  deleteRequests: Array<Record<string, unknown>>;
};

async function installMastraOpenChatMocks(page: Page): Promise<MastraOpenChatCapture> {
  const capture: MastraOpenChatCapture = {
    messageCommands: [],
    historyRequests: [],
    deleteRequests: [],
  };
  const messages: RuntimeMessage[] = [];
  let hasConversation = false;

  await page.route('**/api/v1/settings/preferences', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await fulfillJson(
      route,
      {
        ...createDefaultUserPreferenceProfile(),
        presentation: { theme: 'light', language: 'en-US' },
        regional: {
          timeZone: 'Asia/Shanghai',
          dateStyle: 'medium',
          timeStyle: '24h',
          weekStartsOn: 1,
        },
      },
    );
  });

  await page.route('**/api/v1/ai/providers', async (route) => {
    await fulfillJson(route, {
      data: [
        {
          id: providerId,
          identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
          name: 'E2E OpenAI',
          providerType: 'openai_compatible',
          baseUrl: 'https://api.openai.com/v1',
          apiKeyMasked: 'sk-****e2e',
          defaultModel: modelId,
          availableModels: [{ id: modelId, name: modelId }],
          isActive: true,
          isDefault: true,
          priority: 1,
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
        },
      ],
    });
  });

  await page.route('**/api/v1/ai/chat/conversations?*', async (route) => {
    const conversations = hasConversation
      ? [{ id: conversationId, name: 'Mastra Open Chat', title: 'Mastra Open Chat' }]
      : [];
    await fulfillJson(route, {
      data: conversations,
      total: conversations.length,
      page: 1,
      pageSize: 24,
    });
  });

  await page.route('**/api/v1/ai/chat/conversations', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    hasConversation = true;
    await fulfillJson(route, {
      id: conversationId,
      identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
      name: 'Mastra Open Chat',
      status: 'Active',
      messageCount: messages.length,
      lastMessageAt: null,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
      messages: null,
    });
  });

  await page.route('**/api/v1/ai/runtime/assistant/history', async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    capture.historyRequests.push(body);
    expect(body).not.toHaveProperty('identityId');
    await fulfillJson(route, {
      conversationId: body.conversationId ?? conversationId,
      messages,
    });
  });

  await page.route('**/api/v1/ai/runtime/assistant/delete', async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    capture.deleteRequests.push(body);
    expect(body).not.toHaveProperty('identityId');
    messages.splice(0, messages.length);
    hasConversation = false;
    await fulfillJson(route, { deleted: true });
  });

  await page.route('**/api/v1/ai/runtime/assistant/cancel', async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    expect(body).not.toHaveProperty('identityId');
    await fulfillJson(route, { cancelled: true });
  });

  await page.route('**/api/v1/ai/runtime/assistant/sse', async (route) => {
    const request = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    capture.messageCommands.push(request);

    expect(request).not.toHaveProperty('identityId');
    expect(request).not.toHaveProperty('executionProfileId');
    expect(request).not.toHaveProperty('runId');
    expect(request).toMatchObject({
      type: 'message',
      conversationId,
      surface: 'web',
      providerId,
      modelId,
    });

    const content = typeof request.content === 'string' ? request.content : '';
    const turn = capture.messageCommands.length;
    const now = Date.now();
    const runId = `run-e2e-mastra-${turn}`;
    const userMessage: RuntimeMessage = {
      id: `user-e2e-mastra-${turn}`,
      conversationId,
      role: 'user',
      content,
      createdAt: now,
    };
    const assistantContent = `Mastra persisted reply ${turn}.`;
    const assistantMessage: RuntimeMessage = {
      id: `assistant-e2e-mastra-${turn}`,
      conversationId,
      role: 'assistant',
      content: assistantContent,
      createdAt: now + 1,
    };
    messages.push(userMessage, assistantMessage);
    hasConversation = true;

    const base = { runId, conversationId, createdAt: now };
    await fulfillRuntimeSse(route, [
      {
        ...base,
        eventId: `${runId}:1`,
        sequence: 1,
        type: 'assistant.run.started',
        data: { providerId, modelId },
      },
      {
        ...base,
        eventId: `${runId}:2`,
        sequence: 2,
        type: 'assistant.message.delta',
        data: { content: assistantContent },
      },
      {
        ...base,
        eventId: `${runId}:3`,
        sequence: 3,
        type: 'assistant.usage.updated',
        data: { promptTokens: 12, completionTokens: 5, totalTokens: 17 },
      },
      {
        ...base,
        eventId: `${runId}:4`,
        sequence: 4,
        type: 'assistant.run.completed',
        data: { content: assistantContent, assistantMessageId: assistantMessage.id },
      },
    ]);
  });

  return capture;
}

async function bootstrapMastraOpenChat(page: Page): Promise<MastraOpenChatCapture> {
  await registerAndLogin(page, {
    email: generateTestEmail(),
    password: e2ePassword,
  });
  const capture = await installMastraOpenChatMocks(page);
  await page.goto(WEB_CONFIG.getFullUrl('/'), {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await page.getByTestId('app-shell').waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  await page.getByTestId('ai-chat-view').waitFor({
    state: 'visible',
    timeout: TIMEOUT_CONFIG.NAVIGATION,
  });
  return capture;
}

async function sendMastraMessage(page: Page, message: string): Promise<void> {
  const composer = page.getByTestId('ai-chat-composer');
  await expect(composer).toBeEnabled({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  await expect(page.getByTestId('ai-chat-empty-models')).toHaveCount(0, {
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
  await composer.fill(message);
  const send = page.getByTestId('ai-chat-send-message');
  await expect(send).toBeEnabled({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().includes('/ai/runtime/assistant/sse') &&
      candidate.request().method() === 'POST' &&
      candidate.status() === 200,
    { timeout: TIMEOUT_CONFIG.NAVIGATION },
  );
  await send.click();
  await response;
  await expect(page.getByTestId('ai-chat-stop-generating')).toHaveCount(0, {
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}

test.describe('AI Mastra open-chat product cutover', () => {
  test('[P0] sends through canonical runtime SSE with selected model and no legacy profile/identity', async ({
    page,
  }) => {
    const capture = await bootstrapMastraOpenChat(page);

    await expect(page.getByTestId('ai-chat-execution-profile')).toHaveCount(0);
    await sendMastraMessage(page, 'Use the canonical Mastra runtime.');

    expect(capture.messageCommands).toHaveLength(1);
    expect(capture.messageCommands[0]).toEqual(
      expect.objectContaining({
        type: 'message',
        conversationId,
        content: 'Use the canonical Mastra runtime.',
        surface: 'web',
        providerId,
        modelId,
      }),
    );
    expect(capture.messageCommands[0]).not.toHaveProperty('identityId');
    expect(capture.messageCommands[0]).not.toHaveProperty('executionProfileId');
    await expect(page.getByTestId('ai-message-panel')).toContainText('Mastra persisted reply 1.');
    expect(capture.historyRequests.length).toBeGreaterThanOrEqual(1);
  });

  test('[P0] reload restores the authoritative Mastra transcript instead of legacy AiMessage history', async ({
    page,
  }) => {
    const capture = await bootstrapMastraOpenChat(page);
    await sendMastraMessage(page, 'Persist this turn in Mastra memory.');
    await expect(page.getByTestId('ai-message-panel')).toContainText('Mastra persisted reply 1.');

    await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_CONFIG.NAVIGATION });
    await page.getByTestId('ai-chat-view').waitFor({
      state: 'visible',
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });

    await expect(page.getByTestId('ai-message-panel')).toContainText(
      'Persist this turn in Mastra memory.',
      { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
    );
    await expect(page.getByTestId('ai-message-panel')).toContainText('Mastra persisted reply 1.');
    expect(capture.historyRequests.length).toBeGreaterThanOrEqual(2);
    expect(capture.historyRequests.every((body) => !('identityId' in body))).toBe(true);
  });
});
