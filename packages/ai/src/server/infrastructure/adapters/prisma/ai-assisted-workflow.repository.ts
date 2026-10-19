import { Client } from 'pg';
import type { PrismaClient, AiAssistedWorkflow } from '@memoflow/database';
import type { AssistedConsentSchema } from '@memoflow/contracts/agent-gateway';
import type { z } from 'zod';

/** AI owns durable external run bindings; snapshots remain in the existing Mastra store. */
export class AiAssistedWorkflowRepository {
  constructor(private readonly db: PrismaClient, private readonly connectionString: string) {}

  async locked<T>(key: string, work: (assertLock: () => void) => Promise<T>): Promise<T> {
    // A session lock spans inference without keeping a business transaction open.
    // Disconnect/crash releases it; pending intent in the row drives recovery.
    const client = new Client({ connectionString: this.connectionString });
    let alive = true;
    client.on('error', () => { alive = false; });
    try {
      await client.connect();
      const result = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 538)) AS locked', [key],
      );
      if (!result.rows[0]?.locked) throw new Error('ASSISTED_OPERATION_IN_PROGRESS');
      return await work(() => { if (!alive) throw new Error('ASSISTED_LOCK_LOST'); });
    } finally {
      await client.end();
    }
  }

  findStart(identityId: string, connectionId: string, requestKey: string) {
    return this.db.aiAssistedWorkflow.findUnique({
      where: { identityId_connectionId_requestKey: { identityId, connectionId, requestKey } },
    });
  }
  find(id: string, identityId: string, connectionId: string) {
    return this.db.aiAssistedWorkflow.findFirst({ where: { id, identityId, connectionId, kind: 'task.create' } });
  }
  create(data: Pick<AiAssistedWorkflow, 'id' | 'identityId' | 'connectionId' | 'kind' | 'runId' | 'requestKey' | 'requestDigest' | 'requestJson' | 'pendingJson'>) {
    return this.db.aiAssistedWorkflow.create({ data });
  }
  save(id: string, data: Partial<Pick<AiAssistedWorkflow, 'revision' | 'viewJson' | 'pendingJson' | 'stepsJson' | 'stepKey'>>) {
    return this.db.aiAssistedWorkflow.update({ where: { id }, data });
  }
  async assertConsent(identityId: string, consent: z.infer<typeof AssistedConsentSchema>) {
    const setting = await this.db.aiProviderConfig.findFirst({ where: {
      id: consent.providerId, identityId, version: consent.providerVersion,
      isActive: true, deletedAt: null,
    } });
    if (!setting || setting.defaultModel !== consent.modelId)
      throw new Error('ASSISTED_CONSENT_REQUIRED');
  }
}
