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

const BANNED_CONTENT_PATTERNS = [
  'identityId',
  'identity_id',
  'accountId',
  'account_id',
  'password',
  'apiKey',
  'api_key',
  'secret',
  'sessionToken',
  'accessToken',
  'refreshToken',
];

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

interface ImportResult {
  ok: boolean;
  data?: {
    batchId: string;
    dryRun: boolean;
    capabilities: Array<{
      key: string;
      schemaVersion: number;
      created: number;
      updated: number;
      skipped: number;
      warnings: string[];
    }>;
    created: Record<string, number>;
    updated: Record<string, number>;
    skipped: Record<string, number>;
    warnings: string[];
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

async function callImportAPI(
  page: Page,
  operation: 'dry-run' | 'apply',
  content: string,
): Promise<ImportResult> {
  return page.evaluate(
    async (args) => {
      const res = await fetch(`${args.apiBase}/data-portability/${args.operation}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: args.content }),
      });
      return res.json();
    },
    { apiBase: API_CONFIG.API_PREFIX, operation, content },
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

  test('[P1] export only accepts V3 capability filters', async ({ page }) => {
    const result = await callExportAPI(page, ['preferences']);
    expect(result.ok).toBe(true);

    const envelope = PortableBackupEnvelopeV3Schema.parse(JSON.parse(result.data!.content));
    expect(envelope.capabilities.map((capability) => capability.key)).toEqual(['preferences']);
    expect(result.data!.summary.capabilityKeys).toEqual(['preferences']);
  });

  test('[P1] export does not contain banned identity or credential fields', async ({ page }) => {
    const result = await callExportAPI(page);
    expect(result.ok).toBe(true);
    for (const pattern of BANNED_CONTENT_PATTERNS) {
      expect(result.data!.content).not.toContain(pattern);
    }
  });

  test('[P1] V3 export supports dry-run then apply round-trip', async ({ page }) => {
    const exportResult = await callExportAPI(page);
    expect(exportResult.ok).toBe(true);

    const dryRunResult = await callImportAPI(page, 'dry-run', exportResult.data!.content);
    expect(dryRunResult.ok).toBe(true);
    expect(dryRunResult.data!.dryRun).toBe(true);
    expect(typeof dryRunResult.data!.batchId).toBe('string');

    const applyResult = await callImportAPI(page, 'apply', exportResult.data!.content);
    expect(applyResult.ok).toBe(true);
    expect(applyResult.data!.dryRun).toBe(false);
    expect(typeof applyResult.data!.created).toBe('object');
    expect(typeof applyResult.data!.updated).toBe('object');
    expect(Array.isArray(applyResult.data!.capabilities)).toBe(true);
  });

  test('[P2] dry-run does not persist data', async ({ page }) => {
    const exportBefore = await callExportAPI(page);
    expect(exportBefore.ok).toBe(true);
    const before = PortableBackupEnvelopeV3Schema.parse(JSON.parse(exportBefore.data!.content));

    const dryRunResult = await callImportAPI(page, 'dry-run', exportBefore.data!.content);
    expect(dryRunResult.ok).toBe(true);
    expect(dryRunResult.data!.dryRun).toBe(true);

    const exportAfter = await callExportAPI(page);
    expect(exportAfter.ok).toBe(true);
    const after = PortableBackupEnvelopeV3Schema.parse(JSON.parse(exportAfter.data!.content));
    expect(after.capabilities).toEqual(before.capabilities);
  });

  test('[P2] rejects server-held and unsupported legacy backup envelopes', async ({ page }) => {
    const disclosure = await callImportAPI(
      page,
      'dry-run',
      JSON.stringify({ kind: 'memoflow.server-held-data-disclosure', schemaVersion: 1 }),
    );
    expect(disclosure.ok).toBe(false);

    const legacy = await callImportAPI(
      page,
      'dry-run',
      JSON.stringify({ kind: 'memoflow.user-data-export', schemaVersion: 2, data: {} }),
    );
    expect(legacy.ok).toBe(false);
    expect(legacy.error?.message).toContain('only V3 is supported');
  });

  test('[P2] rejects V3 payloads containing identity fields', async ({ page }) => {
    const exportResult = await callExportAPI(page);
    expect(exportResult.ok).toBe(true);
    const envelope = JSON.parse(exportResult.data!.content) as {
      capabilities: Array<{ payload: Record<string, unknown> }>;
    };
    envelope.capabilities[0].payload.identityId = 'stolen-identity';

    const importResult = await callImportAPI(page, 'dry-run', JSON.stringify(envelope));
    expect(importResult.ok).toBe(false);
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
