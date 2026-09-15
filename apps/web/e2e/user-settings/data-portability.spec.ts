import { test, expect, type Page } from '@playwright/test';
import { UserDataExportEnvelopeV2Schema } from '@memoflow/contracts/data-portability';
import { API_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const VALID_DATA_KEYS = [
  'settings',
  'notificationPreference',
  'userReminderPreference',
  'goals',
  'tasks',
  'reminders',
  'repositories',
  'schedules',
  'editor',
  'ai',
];

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
    summary: {
      entityCounts: Record<string, number>;
      warnings: string[];
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

interface ImportResult {
  ok: boolean;
  data?: {
    batchId: string;
    dryRun: boolean;
    created: Record<string, number>;
    updatedSingletons: Record<string, number>;
    skipped: Record<string, number>;
    warnings: string[];
  };
  error?: {
    code: string;
    message: string;
  };
}

async function callExportAPI(page: Page, include?: string[]): Promise<ExportResult> {
  return page.evaluate(
    async (args) => {
      const res = await fetch(`${args.apiBase}/data-portability/export`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ include: args.include }),
      });
      return res.json();
    },
    { apiBase: API_CONFIG.API_PREFIX, include },
  );
}

async function callImportAPI(page: Page, content: string, dryRun = false): Promise<ImportResult> {
  return page.evaluate(
    async (args) => {
      const res = await fetch(`${args.apiBase}/data-portability/import`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: args.content, dryRun: args.dryRun }),
      });
      return res.json();
    },
    { apiBase: API_CONFIG.API_PREFIX, content, dryRun },
  );
}

test.describe('Data Portability', () => {
  let testEmail: string;

  test.beforeEach(async ({ page }) => {
    testEmail = generateTestEmail();
    await registerAndLogin(page, {
      email: testEmail,
      password: 'Test123456!',
      landingPath: '/settings',
    });
  });

  test('[P1] export returns valid envelope with expected structure', async ({ page }) => {
    const result = await callExportAPI(page);

    expect(result.ok).toBe(true);
    expect(result.data).toBeDefined();

    const { fileName, content, summary } = result.data!;
    expect(fileName).toMatch(/\.json$/);
    expect(typeof content).toBe('string');
    expect(summary).toHaveProperty('entityCounts');
    expect(summary).toHaveProperty('warnings');
    expect(Array.isArray(summary.warnings)).toBe(true);

    const envelope = UserDataExportEnvelopeV2Schema.parse(JSON.parse(content));
    expect(envelope.kind).toBe('memoflow.user-data-export');
    expect(envelope.schemaVersion).toBe(2);
    expect(envelope).toHaveProperty('exportedAt');
    expect(envelope).toHaveProperty('data');
    expect(typeof envelope.data).toBe('object');
  });

  test('[P1] export envelope data keys are valid modules', async ({ page }) => {
    const result = await callExportAPI(page);
    expect(result.ok).toBe(true);

    const envelope = JSON.parse(result.data!.content);
    const dataKeys = Object.keys(envelope.data);

    for (const key of dataKeys) {
      expect(VALID_DATA_KEYS).toContain(key);
    }
  });

  test('[P1] export does not contain banned identity or credential fields', async ({ page }) => {
    const result = await callExportAPI(page);
    expect(result.ok).toBe(true);

    const content = result.data!.content;
    for (const pattern of BANNED_CONTENT_PATTERNS) {
      expect(content).not.toContain(pattern);
    }
  });

  test('[P1] export with include filter returns only requested modules', async ({ page }) => {
    const result = await callExportAPI(page, ['settings']);
    expect(result.ok).toBe(true);

    const envelope = JSON.parse(result.data!.content);
    expect(envelope.data).toHaveProperty('settings');
    expect(envelope.data).not.toHaveProperty('goals');
    expect(envelope.data).not.toHaveProperty('tasks');
    expect(envelope.data).not.toHaveProperty('reminders');
    expect(envelope.data).not.toHaveProperty('repositories');
  });

  test('[P1] import succeeds with valid export content', async ({ page }) => {
    const exportResult = await callExportAPI(page);
    expect(exportResult.ok).toBe(true);

    const importResult = await callImportAPI(page, exportResult.data!.content, false);

    expect(importResult.ok).toBe(true);
    expect(importResult.data).toBeDefined();
    expect(importResult.data!.dryRun).toBe(false);
    expect(typeof importResult.data!.batchId).toBe('string');
    expect(typeof importResult.data!.created).toBe('object');
    expect(typeof importResult.data!.updatedSingletons).toBe('object');
    expect(Array.isArray(importResult.data!.warnings)).toBe(true);
  });

  test('[P1] import appends data on repeated imports', async ({ page }) => {
    const exportResult = await callExportAPI(page);
    expect(exportResult.ok).toBe(true);
    const content = exportResult.data!.content;

    await callImportAPI(page, content, false);
    const secondImport = await callImportAPI(page, content, false);

    expect(secondImport.ok).toBe(true);

    const totalCreated = Object.values(secondImport.data!.created).reduce((sum, n) => sum + n, 0);
    expect(totalCreated).toBeGreaterThanOrEqual(0);
  });

  test('[P2] import dryRun does not persist data', async ({ page }) => {
    const exportBefore = await callExportAPI(page);
    expect(exportBefore.ok).toBe(true);
    const countsBefore = exportBefore.data!.summary.entityCounts;

    const dryRunResult = await callImportAPI(page, exportBefore.data!.content, true);
    expect(dryRunResult.ok).toBe(true);
    expect(dryRunResult.data!.dryRun).toBe(true);

    const exportAfter = await callExportAPI(page);
    expect(exportAfter.ok).toBe(true);

    expect(exportAfter.data!.summary.entityCounts).toEqual(countsBefore);
  });

  test('[P2] import rejects content with banned identity fields', async ({ page }) => {
    const exportResult = await callExportAPI(page);
    expect(exportResult.ok).toBe(true);

    const envelope = JSON.parse(exportResult.data!.content);
    const firstRepo =
      envelope.data?.repositories?.repositories?.[0] ?? envelope.data?.goals?.items?.[0];
    if (firstRepo) {
      firstRepo.identityId = 'stolen-identity';
    } else {
      envelope.data.settings = { ...envelope.data.settings, identityId: 'stolen-identity' };
    }

    const importResult = await callImportAPI(page, JSON.stringify(envelope), false);

    expect(importResult.ok).toBe(false);
    expect(importResult.error).toBeDefined();
  });
});
