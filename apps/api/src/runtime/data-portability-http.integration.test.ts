import request from 'supertest';
import type { Express } from 'express';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PortableBackupEnvelopeV3Schema } from '@memoflow/contracts/data-portability';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';
import { ApiBootstrapper } from '../bootstrap';
import { createCloudAuthStub } from '../test/cloud-auth.stub';
import { composeDataPortability } from './compose-data-portability';
import { composeProfileImportCapabilities } from './compose-profile-import-capabilities';

// Migrated from Web Flow: these contracts need real HTTP routes, owner adapters
// and PostgreSQL, but never interacted with a browser after authentication.
let app: Express;
let bootstrapper: ApiBootstrapper | undefined;
const credential = 'Bearer portability-integration';

beforeEach(async () => {
  await cleanAll();
  const db = await getPrisma();
  // Match the provisioned Account shape. The low-level seed helper defaults
  // to {}, which is not a valid portable AccountProfile (unlike UI signup).
  const account = await seedAccount({
    profile: {
      nickname: 'Portability user',
      realName: null,
      avatarUrl: null,
      bio: null,
      gender: 'PreferNotToSay',
      birthday: null,
    },
  });
  const auth = createCloudAuthStub();
  auth.resolveNodePrincipal = async (headers) =>
    headers.authorization === credential
      ? {
          identityId: account.id,
          sessionId: 'portability-session',
          email: 'integration@example.test',
          emailVerified: true,
        }
      : null;
  bootstrapper = new ApiBootstrapper(db, auth).register(
    composeDataPortability({
      db,
      portableCapabilities: composeProfileImportCapabilities(db),
    }).module,
  );
  app = await bootstrapper.init();
});
afterEach(async () => {
  await bootstrapper?.destroy();
  bootstrapper = undefined;
});
afterAll(disconnectPrisma);

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

async function callExportAPI(capabilities?: string[]): Promise<ExportResult> {
  const response = await request(app)
    .post('/api/v1/data-portability/export')
    .set('authorization', credential)
    .send({ capabilities });
  expect(response.status, JSON.stringify(response.body.error)).toBe(200);
  return response.body;
}
async function callImportAPI(
  operation: 'dry-run' | 'apply',
  content: string,
): Promise<ImportResult> {
  const response = await request(app)
    .post(`/api/v1/data-portability/${operation}`)
    .set('authorization', credential)
    .send({ content });
  expect(response.status).toBeGreaterThanOrEqual(200);
  expect(response.status).toBeLessThan(500);
  return response.body;
}

describe('Data Portability V3 HTTP contracts', () => {
  it('[P1] export only accepts V3 capability filters', async () => {
    const result = await callExportAPI(['preferences']);
    expect(result.ok).toBe(true);

    const envelope = PortableBackupEnvelopeV3Schema.parse(JSON.parse(result.data!.content));
    expect(envelope.capabilities.map((capability) => capability.key)).toEqual(['preferences']);
    expect(result.data!.summary.capabilityKeys).toEqual(['preferences']);
  });

  it('[P1] export does not contain banned identity or credential fields', async () => {
    const result = await callExportAPI();
    expect(result.ok).toBe(true);
    for (const pattern of BANNED_CONTENT_PATTERNS) {
      expect(result.data!.content).not.toContain(pattern);
    }
  });

  it('[P1] V3 export supports dry-run then apply round-trip', async () => {
    const exportResult = await callExportAPI();
    expect(exportResult.ok).toBe(true);

    const dryRunResult = await callImportAPI('dry-run', exportResult.data!.content);
    expect(dryRunResult.ok).toBe(true);
    expect(dryRunResult.data!.dryRun).toBe(true);
    expect(typeof dryRunResult.data!.batchId).toBe('string');

    const applyResult = await callImportAPI('apply', exportResult.data!.content);
    expect(applyResult.ok).toBe(true);
    expect(applyResult.data!.dryRun).toBe(false);
    expect(typeof applyResult.data!.created).toBe('object');
    expect(typeof applyResult.data!.updated).toBe('object');
    expect(Array.isArray(applyResult.data!.capabilities)).toBe(true);
  });

  it('[P2] dry-run does not persist data', async () => {
    const exportBefore = await callExportAPI();
    expect(exportBefore.ok).toBe(true);
    const before = PortableBackupEnvelopeV3Schema.parse(JSON.parse(exportBefore.data!.content));

    const dryRunResult = await callImportAPI('dry-run', exportBefore.data!.content);
    expect(dryRunResult.ok).toBe(true);
    expect(dryRunResult.data!.dryRun).toBe(true);

    const exportAfter = await callExportAPI();
    expect(exportAfter.ok).toBe(true);
    const after = PortableBackupEnvelopeV3Schema.parse(JSON.parse(exportAfter.data!.content));
    expect(after.capabilities).toEqual(before.capabilities);
  });

  it('[P2] rejects server-held and unsupported legacy backup envelopes', async () => {
    const disclosure = await callImportAPI(
      'dry-run',
      JSON.stringify({ kind: 'memoflow.server-held-data-disclosure', schemaVersion: 1 }),
    );
    expect(disclosure.ok).toBe(false);

    const legacy = await callImportAPI(
      'dry-run',
      JSON.stringify({ kind: 'memoflow.user-data-export', schemaVersion: 2, data: {} }),
    );
    expect(legacy.ok).toBe(false);
    expect(legacy.error?.message).toContain('only V3 is supported');
  });

  it('[P2] rejects V3 payloads containing identity fields', async () => {
    const exportResult = await callExportAPI();
    expect(exportResult.ok).toBe(true);
    const envelope = JSON.parse(exportResult.data!.content) as {
      capabilities: Array<{ payload: Record<string, unknown> }>;
    };
    envelope.capabilities[0].payload.identityId = 'stolen-identity';

    const importResult = await callImportAPI('dry-run', JSON.stringify(envelope));
    expect(importResult.ok).toBe(false);
  });
  it('rejects unauthenticated requests at every migrated HTTP boundary', async () => {
    for (const operation of ['export', 'dry-run', 'apply']) {
      const response = await request(app)
        .post(`/api/v1/data-portability/${operation}`)
        .send({ content: '{}' });
      expect(response.status).toBe(401);
    }
  });
});
