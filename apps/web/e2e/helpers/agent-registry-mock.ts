import type { Page } from '@playwright/test';
import { AgentRegistrySnapshotSchema } from '@memoflow/contracts/ai';

/** Complements provider/runtime fixtures with the same Agent authority the live host exposes. */
export async function installMastraRegistryMock(
  page: Page,
  providerId: string,
  modelId: string,
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
  await page.route('**/api/v1/ai/agent-instances', async (route) => {
    const command = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    const data = command?.action === 'conversation_selection' ? null : snapshot;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });
}
