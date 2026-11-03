import type { Result } from '@memoflow/transport-contracts/result';
import { ok, error } from '@memoflow/transport-contracts/result';
import type { ExecutionContext } from '@memoflow/transport-contracts';
import type { AIProviderModelCatalogSnapshot } from '@memoflow/ai-contracts';
import { createLogger } from '@memoflow/utils/logger';
import type { IAIProviderConfigRepository } from '../../../domain/repositories/i-ai-provider-config-repository';
import type { IAIProviderModelCatalogPort, IAIProviderSecretVault } from '../../ports';

const logger = createLogger('RefreshAIProviderModelsUseCase');

/** Provider inventories change rarely; T3-class desktop browsing reads a cached
 * list and only the explicit "refresh models" action asks the Provider again. */
const CATALOG_CACHE_TTL_MS = 60 * 60_000;
const CATALOG_CACHE_MAX_ENTRIES = 100;
interface CachedProviderCatalog {
  snapshot: AIProviderModelCatalogSnapshot;
  expiresAt: number;
  providerVersion: number;
  baseUrl: string;
}
export interface RefreshAIProviderModelsOptions {
  /** Explicit user refresh: ignore the cached inventory. */
  force?: boolean;
}

/**
 * Reads the provider's live model inventory using its stored credential.
 *
 * Crucially this does not mutate the Provider aggregate, persist a model list,
 * bump Provider version, or silently replace the user's explicit default model.
 * A bounded in-memory cache serves non-forced reads so the Composer does not
 * re-query every Provider on each mount; the saved configuration identity is
 * part of the entry, so editing a Provider invalidates it immediately.
 */
export class RefreshAIProviderModelsUseCase {
  private readonly cache = new Map<string, CachedProviderCatalog>();

  constructor(
    private readonly providerConfigRepository: IAIProviderConfigRepository,
    private readonly providerModelCatalogPort: IAIProviderModelCatalogPort,
    private readonly secretVault: IAIProviderSecretVault,
  ) {}

  async execute(
    providerId: string,
    cx: ExecutionContext,
    options: RefreshAIProviderModelsOptions = {},
  ): Promise<Result<AIProviderModelCatalogSnapshot>> {
    const provider = await this.providerConfigRepository.findByIdForIdentity(
      cx.identityId,
      providerId,
    );
    if (!provider) {
      return error('NOT_FOUND', 'Provider not found');
    }

    const cacheKey = JSON.stringify([cx.identityId, provider.id]);
    const cached = this.cache.get(cacheKey);
    if (
      !options.force &&
      cached &&
      cached.expiresAt > Date.now() &&
      cached.providerVersion === provider.version &&
      cached.baseUrl === provider.baseUrl
    ) {
      logger.info('Serving cached AI provider model catalog', {
        identityId: cx.identityId,
        providerId,
        modelCount: cached.snapshot.models.length,
      });
      return ok(cached.snapshot);
    }

    logger.info('Reading AI provider model catalog', {
      identityId: cx.identityId,
      providerId,
      baseUrl: provider.baseUrl,
      currentDefaultModel: provider.defaultModel,
    });

    const credential = await this.secretVault.resolve({
      identityId: cx.identityId,
      credentialRef: provider.credentialRef,
    });
    const models = await this.providerModelCatalogPort.listModels({
      baseUrl: provider.baseUrl,
      apiKey: credential.value,
    });
    const snapshot: AIProviderModelCatalogSnapshot = {
      providerId: provider.id,
      models,
      fetchedAt: Date.now(),
    };
    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, {
      snapshot,
      expiresAt: snapshot.fetchedAt + CATALOG_CACHE_TTL_MS,
      providerVersion: provider.version,
      baseUrl: provider.baseUrl,
    });
    if (this.cache.size > CATALOG_CACHE_MAX_ENTRIES)
      this.cache.delete(this.cache.keys().next().value!);

    logger.info('AI provider model catalog loaded', {
      identityId: cx.identityId,
      providerId,
      modelCount: models.length,
    });

    return ok(snapshot);
  }
}
