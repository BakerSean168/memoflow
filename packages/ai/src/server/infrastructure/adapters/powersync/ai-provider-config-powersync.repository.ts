import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { AIProviderConfigServerDTO } from '@memoflow/contracts/ai';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import { PowerSyncAIProviderConfigMapper, type PowerSyncAIProviderConfigRow } from './mappers';

export class PowerSyncAIProviderConfigRepository implements IAIProviderConfigRepository {
  constructor(private readonly db: IElectronDatabase) {}

  async save(config: AIProviderConfigServerDTO) {
    const d = PowerSyncAIProviderConfigMapper.toPersistence(config);
    return this.db.writeTransaction(async (tx) => {
      const existing = await tx.getOptional<{ id: string; identity_id: string }>(
        `SELECT id, identity_id FROM ai_provider_configs WHERE id = ? LIMIT 1`,
        [d.id],
      );
      if (existing && existing.identity_id !== d.identity_id) {
        throw new Error('Provider config not found for the current identity.');
      }

      if (d.is_default) {
        await tx.execute(
          `UPDATE ai_provider_configs SET is_default = 0
           WHERE identity_id = ? AND id <> ? AND deleted_at IS NULL`,
          [d.identity_id, d.id],
        );
      }

      if (existing) {
        await tx.execute(
          `UPDATE ai_provider_configs
         SET identity_id = ?,
             name = ?,
             provider_definition_id = ?,
             base_url = ?,
             credential_ref = ?,
             default_model = ?,
             is_active = ?,
             is_default = ?,
             priority = ?,
             version = ?,
             updated_at = ?,
             deleted_at = ?
         WHERE id = ?`,
          [
            d.identity_id,
            d.name,
            d.provider_definition_id,
            d.base_url,
            d.credential_ref,
            d.default_model,
            d.is_active,
            d.is_default,
            d.priority,
            d.version,
            d.updated_at,
            d.deleted_at,
            d.id,
          ],
        );
      } else {
        await tx.execute(
          `INSERT INTO ai_provider_configs (
           id, identity_id, name, provider_definition_id, base_url, credential_ref,
           default_model, is_active, is_default, priority,
           version, created_at, updated_at, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            d.id,
            d.identity_id,
            d.name,
            d.provider_definition_id,
            d.base_url,
            d.credential_ref,
            d.default_model,
            d.is_active,
            d.is_default,
            d.priority,
            d.version,
            d.created_at,
            d.updated_at,
            d.deleted_at,
          ],
        );
      }
      return 'SAVED' as const;
    });
  }

  async findByIdForIdentity(
    identityId: string,
    id: string,
  ): Promise<AIProviderConfigServerDTO | null> {
    const row = await this.db.getOptional<PowerSyncAIProviderConfigRow>(
      `SELECT * FROM ai_provider_configs WHERE id = ? AND identity_id = ? AND deleted_at IS NULL LIMIT 1`,
      [id, identityId],
    );
    return row ? PowerSyncAIProviderConfigMapper.toDTO(row) : null;
  }

  async findByIdentityId(identityId: string): Promise<AIProviderConfigServerDTO[]> {
    const rows = await this.db.getAll<PowerSyncAIProviderConfigRow>(
      `SELECT * FROM ai_provider_configs
       WHERE identity_id = ? AND deleted_at IS NULL
       ORDER BY priority ASC, created_at ASC`,
      [identityId],
    );
    return rows.map((row) => PowerSyncAIProviderConfigMapper.toDTO(row));
  }

  async findDefaultByIdentityId(identityId: string): Promise<AIProviderConfigServerDTO | null> {
    const row = await this.db.getOptional<PowerSyncAIProviderConfigRow>(
      `SELECT * FROM ai_provider_configs
       WHERE identity_id = ? AND is_default = 1 AND is_active = 1 AND deleted_at IS NULL
       LIMIT 1`,
      [identityId],
    );
    return row ? PowerSyncAIProviderConfigMapper.toDTO(row) : null;
  }

  async delete(identityId: string, id: string): Promise<void> {
    const existing = await this.findByIdForIdentity(identityId, id);
    if (!existing) {
      throw new Error('Provider config not found for the current identity.');
    }
    const now = new Date().toISOString();
    await this.db.execute(
      `UPDATE ai_provider_configs SET is_default = 0, deleted_at = ?, updated_at = ? WHERE id = ? AND identity_id = ?`,
      [now, now, id, identityId],
    );
  }

  async setDefaultForIdentity(identityId: string, id: string) {
    return this.db.writeTransaction(async (tx) => {
      const provider = await tx.getOptional<{ id: string }>(
        `SELECT id FROM ai_provider_configs
         WHERE id = ? AND identity_id = ? AND is_active = 1 AND deleted_at IS NULL
         LIMIT 1`,
        [id, identityId],
      );
      if (!provider) {
        return 'NOT_FOUND' as const;
      }

      const now = new Date().toISOString();
      await tx.execute(
        `UPDATE ai_provider_configs SET is_default = 0, updated_at = ?
         WHERE identity_id = ? AND id <> ? AND deleted_at IS NULL`,
        [now, identityId, id],
      );
      const updated = await tx.execute(
        `UPDATE ai_provider_configs
         SET is_default = 1, version = version + 1, updated_at = ?
         WHERE id = ? AND identity_id = ? AND is_active = 1 AND deleted_at IS NULL`,
        [now, id, identityId],
      );
      return updated.rowsAffected === 1 ? ('SET' as const) : ('CONFLICT' as const);
    });
  }
}
