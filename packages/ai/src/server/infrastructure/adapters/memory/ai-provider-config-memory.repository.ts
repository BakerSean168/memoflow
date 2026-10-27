/**
 * AIProviderConfig Memory Repository
 *
 * In-memory implementation of IAIProviderConfigRepository for testing.
 */

import type { IAIProviderConfigRepository } from '../../../domain';
import type { AIProviderConfigServerDTO } from '@memoflow/ai-contracts';

/**
 * AIProviderConfig Memory Repository
 *
 * In-memory implementation for testing purposes.
 */
export class AIProviderConfigMemoryRepository implements IAIProviderConfigRepository {
  private configs = new Map<string, AIProviderConfigServerDTO>();

  async save(config: AIProviderConfigServerDTO) {
    const identityId = String(config.identityId);
    const existing = this.configs.get(String(config.id));
    if (existing && String(existing.identityId) !== String(config.identityId)) {
      throw new Error('Provider config not found for the current identity.');
    }
    if (config.isDefault) {
      this.clearIdentityDefault(identityId, String(config.id));
    }
    this.configs.set(String(config.id), config);
    return 'SAVED' as const;
  }

  async findByIdForIdentity(
    identityId: string,
    id: string,
  ): Promise<AIProviderConfigServerDTO | null> {
    const config = this.configs.get(id) ?? null;
    if (!config || String(config.identityId) !== identityId) return null;
    return config;
  }

  async findByIdentityId(identityId: string): Promise<AIProviderConfigServerDTO[]> {
    return Array.from(this.configs.values()).filter((c) => c.identityId === identityId);
  }

  async findDefaultByIdentityId(identityId: string): Promise<AIProviderConfigServerDTO | null> {
    return (
      Array.from(this.configs.values()).find((c) => c.identityId === identityId && c.isDefault) ??
      null
    );
  }

  async delete(identityId: string, id: string): Promise<void> {
    const config = this.configs.get(id);
    if (!config || String(config.identityId) !== identityId) {
      throw new Error('Provider config not found for the current identity.');
    }
    this.configs.delete(id);
  }

  async setDefaultForIdentity(identityId: string, id: string) {
    const target = this.configs.get(id);
    if (
      !target ||
      String(target.identityId) !== identityId ||
      !target.isActive ||
      target.deletedAt != null
    ) {
      return 'NOT_FOUND' as const;
    }

    this.clearIdentityDefault(identityId, id);
    this.configs.set(id, {
      ...target,
      isDefault: true,
      version: target.version + 1,
      updatedAt: Date.now(),
    });
    return 'SET' as const;
  }

  private clearIdentityDefault(identityId: string, exceptId?: string): void {
    this.configs.forEach((c) => {
      if (String(c.identityId) === identityId && String(c.id) !== exceptId) {
        c.isDefault = false;
      }
    });
  }

  // Test helpers
  clear(): void {
    this.configs.clear();
  }

  seed(configs: AIProviderConfigServerDTO[]): void {
    configs.forEach((c) => this.configs.set(c.id, c));
  }
}
