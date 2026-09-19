import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type {
  AIProviderOnboardingCommitOutcome,
  AIProviderReplacementCommitOutcome,
  IAIProviderOnboardingCommitPort,
} from '../../../application/ports/provider-onboarding-commit.port';
import type { AIProviderConnectionServerDTO } from '@memoflow/contracts/ai';

interface OnboardingCommitRow {
  identity_id: string;
  base_url: string;
  target_provider_id: string | null;
  expires_at: number;
  consumed_at: number | null;
}

interface ProviderPersistenceRow {
  id: string;
  identity_id: string;
  name: string;
  provider_definition_id: string;
  base_url: string;
  credential_ref: string;
  default_model: string | null;
  is_active: number;
  is_default: number;
  priority: number;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

class ReplacementRollback extends Error {
  constructor(readonly outcome: AIProviderReplacementCommitOutcome) {
    super(outcome);
  }
}

/**
 * Desktop atomic Provider onboarding persistence.
 *
 * The onboarding row is localOnly, so consuming it and inserting/replacing the
 * synced Provider share one SQLite write transaction. Any failed Provider write
 * rolls the one-time consume back too.
 */
export class PowerSyncAIProviderOnboardingCommitAdapter implements IAIProviderOnboardingCommitPort {
  constructor(private readonly db: IElectronDatabase) {}

  async commit(
    input: Parameters<IAIProviderOnboardingCommitPort['commit']>[0],
  ): Promise<AIProviderOnboardingCommitOutcome> {
    if (String(input.provider.identityId) !== input.identityId) return 'SESSION_UNAVAILABLE';
    const row = toPersistence(input.provider);

    try {
      return await this.db.writeTransaction(async (tx) => {
        const session = await tx.getOptional<OnboardingCommitRow>(
          `SELECT identity_id, base_url, target_provider_id, expires_at, consumed_at
           FROM ai_provider_onboarding_sessions
           WHERE id = ? AND identity_id = ? AND target_provider_id IS NULL
             AND expires_at > ? AND consumed_at IS NULL
           LIMIT 1`,
          [input.onboardingId, input.identityId, input.now],
        );
        if (
          !session ||
          session.identity_id !== input.identityId ||
          session.target_provider_id != null ||
          session.base_url !== input.provider.baseUrl
        ) {
          return 'SESSION_UNAVAILABLE' as const;
        }

        const duplicate = await tx.getOptional<{ id: string }>(
          `SELECT id FROM ai_provider_configs
           WHERE identity_id = ? AND name = ? AND deleted_at IS NULL
           LIMIT 1`,
          [input.identityId, row.name],
        );
        if (duplicate) return 'CONFLICT' as const;

        const consumed = await tx.execute(
          `UPDATE ai_provider_onboarding_sessions
           SET consumed_at = ?, updated_at = ?
           WHERE id = ? AND identity_id = ? AND target_provider_id IS NULL
             AND expires_at > ? AND consumed_at IS NULL`,
          [input.now, input.now, input.onboardingId, input.identityId, input.now],
        );
        if (consumed.rowsAffected !== 1) return 'SESSION_UNAVAILABLE' as const;

        if (row.is_default) {
          await tx.execute(
            `UPDATE ai_provider_configs SET is_default = 0, updated_at = ?
             WHERE identity_id = ? AND deleted_at IS NULL`,
            [row.updated_at, input.identityId],
          );
        }

        const credential = await tx.execute(
          `UPDATE ai_provider_secrets SET expires_at = NULL, updated_at = ?
           WHERE id = ? AND identity_id = ? AND revoked_at IS NULL`,
          [input.now, row.credential_ref, input.identityId],
        );
        if (credential.rowsAffected !== 1) throw new Error('AI provider credential is unavailable');

        await tx.execute(
          `INSERT INTO ai_provider_configs (
            id, identity_id, name, provider_definition_id, base_url, credential_ref,
            default_model, is_active, is_default, priority,
            version, created_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id,
            row.identity_id,
            row.name,
            row.provider_definition_id,
            row.base_url,
            row.credential_ref,
            row.default_model,
            row.is_active,
            row.is_default,
            row.priority,
            row.version,
            row.created_at,
            row.updated_at,
            row.deleted_at,
          ],
        );

        return 'COMMITTED' as const;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) return 'CONFLICT';
      throw error;
    }
  }

  async replace(
    input: Parameters<IAIProviderOnboardingCommitPort['replace']>[0],
  ): Promise<AIProviderReplacementCommitOutcome> {
    if (
      String(input.replacement.id) !== input.targetProviderId ||
      String(input.replacement.identityId) !== input.identityId
    ) {
      return 'SESSION_UNAVAILABLE';
    }

    try {
      return await this.db.writeTransaction(async (tx) => {
        const session = await tx.getOptional<OnboardingCommitRow>(
          `SELECT identity_id, base_url, target_provider_id, expires_at, consumed_at
           FROM ai_provider_onboarding_sessions
           WHERE id = ? AND identity_id = ? AND target_provider_id = ?
             AND expires_at > ? AND consumed_at IS NULL
           LIMIT 1`,
          [input.onboardingId, input.identityId, input.targetProviderId, input.now],
        );
        if (
          !session ||
          session.identity_id !== input.identityId ||
          session.target_provider_id !== input.targetProviderId ||
          session.base_url !== input.replacement.baseUrl
        ) {
          return 'SESSION_UNAVAILABLE' as const;
        }

        const current = await tx.getOptional<{ id: string; version: number; credential_ref: string }>(
          `SELECT id, version, credential_ref FROM ai_provider_configs
           WHERE id = ? AND identity_id = ? AND deleted_at IS NULL
           LIMIT 1`,
          [input.targetProviderId, input.identityId],
        );
        if (!current) return 'PROVIDER_NOT_FOUND' as const;
        if (current.version !== input.expectedVersion) return 'CONFLICT' as const;

        const consumed = await tx.execute(
          `UPDATE ai_provider_onboarding_sessions
           SET consumed_at = ?, updated_at = ?
           WHERE id = ? AND identity_id = ? AND target_provider_id = ?
             AND expires_at > ? AND consumed_at IS NULL`,
          [
            input.now,
            input.now,
            input.onboardingId,
            input.identityId,
            input.targetProviderId,
            input.now,
          ],
        );
        if (consumed.rowsAffected !== 1) return 'SESSION_UNAVAILABLE' as const;

        const updated = await tx.execute(
          `UPDATE ai_provider_configs
           SET base_url = ?, credential_ref = ?, default_model = ?, version = ?, updated_at = ?
           WHERE id = ? AND identity_id = ? AND version = ? AND deleted_at IS NULL`,
          [
            input.replacement.baseUrl,
            input.replacement.credentialRef,
            input.replacement.defaultModel,
            input.replacement.version,
            input.replacement.updatedAt,
            input.targetProviderId,
            input.identityId,
            input.expectedVersion,
          ],
        );
        if (updated.rowsAffected !== 1) {
          throw new ReplacementRollback('CONFLICT');
        }
        const credential = await tx.execute(
          `UPDATE ai_provider_secrets SET expires_at = NULL, updated_at = ?
           WHERE id = ? AND identity_id = ? AND revoked_at IS NULL`,
          [input.now, input.replacement.credentialRef, input.identityId],
        );
        if (credential.rowsAffected !== 1) throw new Error('AI provider credential is unavailable');

        const revoked = await tx.execute(
          `UPDATE ai_provider_secrets SET revoked_at = ?, updated_at = ?
           WHERE id = ? AND identity_id = ? AND revoked_at IS NULL`,
          [input.now, input.now, input.previousCredentialRef, input.identityId],
        );
        if (revoked.rowsAffected !== 1) throw new Error('AI provider credential is unavailable');

        return 'REPLACED' as const;
      });
    } catch (error) {
      if (error instanceof ReplacementRollback) return error.outcome;
      throw error;
    }
  }
}

const SQLITE_UNIQUE_CONSTRAINT_CODES = new Set([
  'SQLITE_CONSTRAINT_UNIQUE',
  'SQLITE_CONSTRAINT_PRIMARYKEY',
]);

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && SQLITE_UNIQUE_CONSTRAINT_CODES.has(code);
}

function toPersistence(config: AIProviderConnectionServerDTO): ProviderPersistenceRow {
  return {
    id: String(config.id),
    identity_id: String(config.identityId),
    name: config.name,
    provider_definition_id: config.providerDefinitionId,
    base_url: config.baseUrl,
    credential_ref: String(config.credentialRef),
    default_model: config.defaultModel,
    is_active: config.isActive ? 1 : 0,
    is_default: config.isDefault ? 1 : 0,
    priority: config.priority,
    version: config.version,
    created_at: new Date(config.createdAt).toISOString(),
    updated_at: new Date(config.updatedAt).toISOString(),
    deleted_at: config.deletedAt ? new Date(config.deletedAt).toISOString() : null,
  };
}
