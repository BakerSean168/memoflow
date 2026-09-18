import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { AIModelInfo, AIProviderCatalogId } from '@memoflow/contracts/ai';
import type {
  AIProviderOnboardingCredentialStatus,
  AIProviderOnboardingDiscoveryStatus,
  AIProviderOnboardingSessionRecord,
  CreateAIProviderOnboardingSessionInput,
  IAIProviderOnboardingSessionRepository,
} from '../../../application/ports/provider-onboarding-session.repository';

interface PowerSyncProviderOnboardingRow {
  id: string;
  identity_id: string;
  catalog_id: string;
  base_url: string;
  target_provider_id: string | null;
  credential_ref: string;
  credential_status: string;
  discovery_status: string;
  models_json: string | null;
  verified_model_ids_json: string | null;
  expires_at: number;
  consumed_at: number | null;
  created_at: number;
  updated_at: number;
}

export class PowerSyncAIProviderOnboardingSessionRepository
  implements IAIProviderOnboardingSessionRepository
{
  constructor(private readonly db: IElectronDatabase) {}

  async create(input: CreateAIProviderOnboardingSessionInput): Promise<void> {
    await this.db.execute(
      `INSERT INTO ai_provider_onboarding_sessions (
        id, identity_id, catalog_id, base_url, target_provider_id, credential_ref,
        credential_status, discovery_status, models_json,
        verified_model_ids_json, expires_at, consumed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [
        input.id,
        input.identityId,
        input.catalogId,
        input.baseUrl,
        input.targetProviderId ?? null,
        input.credentialRef,
        input.credentialStatus,
        input.discoveryStatus,
        JSON.stringify(input.models),
        '[]',
        input.expiresAt,
        input.now,
        input.now,
      ],
    );
  }

  async findUsable(
    identityId: string,
    onboardingId: string,
    now: number,
  ): Promise<AIProviderOnboardingSessionRecord | null> {
    const row = await this.db.getOptional<PowerSyncProviderOnboardingRow>(
      `SELECT * FROM ai_provider_onboarding_sessions
       WHERE id = ? AND identity_id = ? AND expires_at > ? AND consumed_at IS NULL
       LIMIT 1`,
      [onboardingId, identityId, now],
    );
    return row ? this.toRecord(row) : null;
  }

  async markModelVerified(input: {
    identityId: string;
    onboardingId: string;
    modelId: string;
    now: number;
  }): Promise<AIProviderOnboardingSessionRecord | null> {
    return this.db.writeTransaction(async (tx) => {
      const row = await tx.getOptional<PowerSyncProviderOnboardingRow>(
        `SELECT * FROM ai_provider_onboarding_sessions
         WHERE id = ? AND identity_id = ? AND expires_at > ? AND consumed_at IS NULL
         LIMIT 1`,
        [input.onboardingId, input.identityId, input.now],
      );
      if (!row) return null;

      const verified = Array.from(new Set([...parseStringArray(row.verified_model_ids_json), input.modelId]));
      const updated = await tx.execute(
        `UPDATE ai_provider_onboarding_sessions
         SET credential_status = 'valid', verified_model_ids_json = ?, updated_at = ?
         WHERE id = ? AND identity_id = ? AND expires_at > ? AND consumed_at IS NULL`,
        [JSON.stringify(verified), input.now, input.onboardingId, input.identityId, input.now],
      );
      if (updated.rowsAffected !== 1) return null;
      return this.toRecord({
        ...row,
        credential_status: 'valid',
        verified_model_ids_json: JSON.stringify(verified),
        updated_at: input.now,
      });
    });
  }

  async markConsumed(input: {
    identityId: string;
    onboardingId: string;
    now: number;
  }): Promise<boolean> {
    const updated = await this.db.execute(
      `UPDATE ai_provider_onboarding_sessions
       SET consumed_at = ?, updated_at = ?
       WHERE id = ? AND identity_id = ? AND expires_at > ? AND consumed_at IS NULL`,
      [input.now, input.now, input.onboardingId, input.identityId, input.now],
    );
    return updated.rowsAffected === 1;
  }

  private toRecord(row: PowerSyncProviderOnboardingRow): AIProviderOnboardingSessionRecord {
    return {
      id: row.id,
      identityId: row.identity_id,
      catalogId: row.catalog_id as AIProviderCatalogId,
      baseUrl: row.base_url,
      targetProviderId: row.target_provider_id,
      credentialRef: row.credential_ref as AIProviderOnboardingSessionRecord['credentialRef'],
      credentialStatus: row.credential_status as AIProviderOnboardingCredentialStatus,
      discoveryStatus: row.discovery_status as AIProviderOnboardingDiscoveryStatus,
      models: parseModels(row.models_json),
      verifiedModelIds: parseStringArray(row.verified_model_ids_json),
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

function parseModels(value: string | null): AIModelInfo[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as AIModelInfo[]) : [];
  } catch {
    return [];
  }
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
