import { computed, inject, onScopeDispose, ref, watch } from 'vue';
import type {
  AICapabilities,
  AIProviderConfigClientDTO,
  ExpandKnowledgeReq,
  TestAIProviderReq,
  TestAIProviderRes,
  UpdateAIProviderConfigReq,
  AIProviderCatalogEntryDTO,
  ProbeAIProviderConnectionReq,
  TestAIProviderOnboardingModelReq,
  CommitAIProviderOnboardingReq,
  ProbeAIProviderReplacementReq,
  CommitAIProviderReplacementReq,
} from '@memoflow/contracts/ai';
import { unwrap } from '@memoflow/contracts/result';
import { AI_CLIENT_KEY, AI_CONFIGURATION_REVISION_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';

/**
 * AI provider/capabilities composable.
 * Provider/capabilities/conversation/goal/knowledge/analytics methods consume
 * Result ports (residual 96–98); message/stream/agent still throw-unwrap.
 */
export function useAI() {
  const client = useStrictInject(AI_CLIENT_KEY, 'AIClient');
  const configurationRevision = inject(AI_CONFIGURATION_REVISION_KEY, undefined);
  const invalidateConfiguration = () => {
    if (configurationRevision) configurationRevision.value++;
  };
  let providerLoadGeneration = 0;
  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
    providerLoadGeneration++;
  });
  const providers = ref<AIProviderConfigClientDTO[]>([]);
  const capabilities = ref<AICapabilities | null>(null);
  const providerCatalog = ref<AIProviderCatalogEntryDTO[]>([]);
  const isLoadingProviders = ref(false);
  const isLoadingCapabilities = ref(false);

  const hasProviders = computed(() => providers.value.length > 0);

  async function loadProviders() {
    const generation = ++providerLoadGeneration;
    isLoadingProviders.value = true;
    try {
      const nextProviders = unwrap(await client.listProviders());
      if (!disposed && generation === providerLoadGeneration) providers.value = nextProviders;
      return providers.value;
    } catch (error) {
      if (!disposed && generation === providerLoadGeneration) providers.value = [];
      throw error;
    } finally {
      if (!disposed && generation === providerLoadGeneration) isLoadingProviders.value = false;
    }
  }
  if (configurationRevision) {
    watch(configurationRevision, () => {
      void loadProviders().catch(() => undefined);
    });
  }

  async function loadCapabilities() {
    isLoadingCapabilities.value = true;
    try {
      capabilities.value = unwrap(await client.getCapabilities());
      return capabilities.value;
    } finally {
      isLoadingCapabilities.value = false;
    }
  }

  async function loadProviderCatalog() {
    providerCatalog.value = unwrap(await client.getProviderCatalog());
    return providerCatalog.value;
  }

  async function probeProviderConnection(request: ProbeAIProviderConnectionReq) {
    return unwrap(await client.probeProviderConnection(request));
  }

  async function testProviderOnboardingModel(request: TestAIProviderOnboardingModelReq) {
    return unwrap(await client.testProviderOnboardingModel(request));
  }

  async function commitProviderOnboarding(request: CommitAIProviderOnboardingReq) {
    const provider = unwrap(await client.commitProviderOnboarding(request));
    invalidateConfiguration();
    await loadProviders();
    return provider;
  }

  async function probeProviderReplacement(
    providerId: string,
    request: ProbeAIProviderReplacementReq,
  ) {
    return unwrap(await client.probeProviderReplacement(providerId, request));
  }

  async function commitProviderReplacement(
    providerId: string,
    request: CommitAIProviderReplacementReq,
  ) {
    const provider = unwrap(await client.commitProviderReplacement(providerId, request));
    invalidateConfiguration();
    await loadProviders();
    return provider;
  }

  async function updateProvider(id: string, request: UpdateAIProviderConfigReq) {
    const provider = unwrap(await client.updateProvider(id, request));
    invalidateConfiguration();
    await loadProviders();
    return provider;
  }

  async function deleteProvider(id: string) {
    unwrap(await client.deleteProvider(id));
    invalidateConfiguration();
    await loadProviders();
  }

  async function setDefaultProvider(providerId: string) {
    unwrap(await client.setDefaultProvider(providerId));
    invalidateConfiguration();
    await loadProviders();
  }

  async function refreshProviderModels(providerId: string) {
    return unwrap(await client.refreshProviderModels(providerId));
  }

  async function testProvider(request: TestAIProviderReq): Promise<TestAIProviderRes> {
    return unwrap(await client.testProvider(request));
  }

  async function expandKnowledge(request: ExpandKnowledgeReq) {
    return unwrap(await client.expandKnowledge(request));
  }

  return {
    service: client,
    invalidateConfiguration,
    providers,
    capabilities,
    providerCatalog,
    hasProviders,
    isLoadingProviders,
    isLoadingCapabilities,
    loadCapabilities,
    loadProviders,
    loadProviderCatalog,
    probeProviderConnection,
    testProviderOnboardingModel,
    commitProviderOnboarding,
    probeProviderReplacement,
    commitProviderReplacement,
    updateProvider,
    deleteProvider,
    setDefaultProvider,
    refreshProviderModels,
    testProvider,
    expandKnowledge,
  };
}
