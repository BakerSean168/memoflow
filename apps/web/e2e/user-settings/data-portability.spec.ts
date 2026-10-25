import { test, expect, type Page } from '@playwright/test';
import { PortableBackupEnvelopeV3Schema } from '@memoflow/contracts/data-portability';
import { API_CONFIG, TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const V3_CAPABILITY_KEYS = [
  'account-profile',
  'preferences',
  'notification-delivery-preferences',
  'routines',
  'schedules',
  'notifications',
  'labels',
  'goals',
  'tasks',
  'ai-conversations',
] as const;

function generateTestEmail(): string {
  return `e2e-data-portability-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

interface ExportResult {
  ok: boolean;
  data?: {
    fileName: string;
    content: string;
    summary: { capabilityKeys: string[]; warnings: string[] };
  };
  error?: { code: string; message: string };
}

async function callExportAPI(page: Page, capabilities?: string[]): Promise<ExportResult> {
  return page.evaluate(
    async (args) => {
      const res = await fetch(`${args.apiBase}/data-portability/export`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capabilities: args.capabilities }),
      });
      return res.json();
    },
    { apiBase: API_CONFIG.API_PREFIX, capabilities },
  );
}

test.describe('Data Portability V3', () => {
  let testEmail: string;

  test.beforeEach(async ({ page }) => {
    testEmail = generateTestEmail();
    await registerAndLogin(page, {
      email: testEmail,
      password: 'Test123456!',
      landingPath: '/settings',
    });
  });

  test('[P1] export returns registered capabilities with materialized owner state', async ({
    page,
  }) => {
    // NotificationPreference is optional owner state; materialize it through the public settings
    // surface before asserting that its registered capability has an exported payload.
    await materializeNotificationPreference(page);

    const result = await callExportAPI(page);

    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();
    const { fileName, content, summary } = result.data!;
    expect(fileName).toMatch(/memoflow-user-data-v3-.*\.json$/);
    expect(summary).toEqual({
      capabilityKeys: expect.arrayContaining([...V3_CAPABILITY_KEYS]),
      warnings: [],
    });

    const envelope = PortableBackupEnvelopeV3Schema.parse(JSON.parse(content));
    expect(envelope.format).toBe('memoflow.user-data-export');
    expect(envelope.schemaVersion).toBe(3);
    expect(envelope.capabilities.map((capability) => capability.key)).toEqual(
      summary.capabilityKeys,
    );
    expect(envelope.capabilities.every((capability) => capability.schemaVersion === 3)).toBe(true);
  });
});

async function materializeNotificationPreference(page: Page): Promise<void> {
  await page.getByTestId('settings-tab-notifications').click();
  await expect(page.getByTestId('notification-delivery-card')).toBeVisible({
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });

  const notificationToggle = page.getByTestId('notification-global-inApp');
  const initialState = await notificationToggle.getAttribute('aria-checked');
  const updatedState = initialState === 'true' ? 'false' : 'true';
  const updateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/notifications/preferences') &&
      response.request().method() === 'PUT' &&
      response.ok(),
  );

  await notificationToggle.click();
  await updateResponse;
  await expect(notificationToggle).toHaveAttribute('aria-checked', updatedState, {
    timeout: TIMEOUT_CONFIG.ELEMENT_WAIT,
  });
}
