export const AI_PROVIDER_CATALOG_IDS = [
  'openrouter',
  'openai',
  'gemini',
  'deepseek',
  'custom',
] as const;

export type AIProviderCatalogId = (typeof AI_PROVIDER_CATALOG_IDS)[number];
/** Canonical ProviderDefinition identity; catalog is the current registry implementation. */
export type AIProviderDefinitionId = AIProviderCatalogId;
export type AIProviderCredentialProbeStrategy = 'openrouter_key' | 'authenticated_models';
export type AIProviderModelDiscoveryStrategy = 'openai_models';

export interface AIProviderDefinition {
  readonly id: AIProviderDefinitionId;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly protocol: 'openai_compatible';
  readonly defaultBaseUrl: string;
  readonly baseUrlEditable: boolean;
  readonly authKind: 'bearer_api_key';
  readonly credentialProbeStrategy: AIProviderCredentialProbeStrategy;
  readonly modelDiscoveryStrategy: AIProviderModelDiscoveryStrategy;
  readonly docsUrl?: string;
  readonly apiKeyUrl?: string;
  readonly recommendedModelIds: readonly string[];
  readonly capabilities: {
    readonly supportsModelList: boolean;
    readonly manualModelFallback: boolean;
  };
}

/** Existing catalog name retained as a type alias; the catalog is the definition owner. */
export type AIProviderCatalogEntry = AIProviderDefinition;

/**
 * Product-owned provider onboarding catalog.
 *
 * This catalog is metadata only: it never stores user credentials and never
 * silently chooses a default model. `recommendedModelIds` may influence UI
 * ranking, but the user must explicitly select `defaultModelId` before commit.
 */
export const AI_PROVIDER_CATALOG: readonly AIProviderDefinition[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'OpenAI-compatible multi-model gateway',
    icon: 'openrouter',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    baseUrlEditable: false,
    authKind: 'bearer_api_key',
    credentialProbeStrategy: 'openrouter_key',
    modelDiscoveryStrategy: 'openai_models',
    docsUrl: 'https://openrouter.ai/docs',
    apiKeyUrl: 'https://openrouter.ai/keys',
    recommendedModelIds: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
    capabilities: { supportsModelList: true, manualModelFallback: true },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Official OpenAI API',
    icon: 'openai',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    baseUrlEditable: false,
    authKind: 'bearer_api_key',
    credentialProbeStrategy: 'authenticated_models',
    modelDiscoveryStrategy: 'openai_models',
    docsUrl: 'https://platform.openai.com/docs',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    recommendedModelIds: ['gpt-4o-mini', 'gpt-4o'],
    capabilities: { supportsModelList: true, manualModelFallback: true },
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Official Gemini API via Google OpenAI-compatible endpoint',
    icon: 'gemini',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    baseUrlEditable: false,
    authKind: 'bearer_api_key',
    credentialProbeStrategy: 'authenticated_models',
    modelDiscoveryStrategy: 'openai_models',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    recommendedModelIds: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    capabilities: { supportsModelList: true, manualModelFallback: true },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Official DeepSeek OpenAI-compatible endpoint',
    icon: 'deepseek',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    baseUrlEditable: false,
    authKind: 'bearer_api_key',
    credentialProbeStrategy: 'authenticated_models',
    modelDiscoveryStrategy: 'openai_models',
    docsUrl: 'https://api-docs.deepseek.com/',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    recommendedModelIds: ['deepseek-chat'],
    capabilities: { supportsModelList: true, manualModelFallback: true },
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-compatible',
    description: 'Connect any OpenAI-compatible HTTPS endpoint',
    icon: 'custom',
    protocol: 'openai_compatible',
    defaultBaseUrl: '',
    baseUrlEditable: true,
    authKind: 'bearer_api_key',
    credentialProbeStrategy: 'authenticated_models',
    modelDiscoveryStrategy: 'openai_models',
    recommendedModelIds: [],
    capabilities: { supportsModelList: true, manualModelFallback: true },
  },
] as const;

export function getAIProviderCatalogEntry(id: string): AIProviderDefinition | undefined {
  return AI_PROVIDER_CATALOG.find((entry) => entry.id === id);
}
