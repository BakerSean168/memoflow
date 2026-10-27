import type { Page } from '@playwright/test';
import {
  AgentRegistrySnapshotSchema,
  AIProviderModelCatalogSnapshotSchema,
} from '@memoflow/ai-contracts';

/** Complements provider/runtime fixtures with the same Agent authority the live host exposes. */
export async function installMastraRegistryMock(
  page: Page,
  providerId: string,
  modelId: string,
  options: { beforeList?: Promise<void>; onListRequested?: () => void } = {},
): Promise<void> {
  const snapshot = AgentRegistrySnapshotSchema.parse({
    instances: [
      {
        instanceId: 'mastra',
        driver: 'mastra',
        name: 'Mastra',
        accentColor: '#6469da',
        enabled: true,
        revision: 1,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    bindings: [{ instanceId: 'mastra', connectionId: providerId, modelId }],
  });
  // The composer now waits for the verified live catalogue instead of treating
  // persisted availableModels as discovery evidence. Keep this isolated runtime
  // fixture complete; never send a synthetic provider ID to the real API.
  const catalog = AIProviderModelCatalogSnapshotSchema.parse({
    providerId,
    models: [{ id: modelId, name: modelId }],
    fetchedAt: 1,
  });
  await page.route(`**/api/v1/ai/providers/${providerId}/refresh-models`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: catalog }),
    });
  });
  await page.route('**/api/v1/ai/agent-instances', async (route) => {
    if (route.request().method() === 'GET') {
      options.onListRequested?.();
      await options.beforeList;
    }
    const command = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    const data = command?.action === 'conversation_selection' ? null : snapshot;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });
}
