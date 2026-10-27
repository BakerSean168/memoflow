import type { AIModelCapabilityMap } from '../aggregates/ai-model-resolution';
import type { AIProviderDefinitionId } from './ai-provider-catalog';

export interface AIProviderModelCapabilityDefinition {
  readonly providerDefinitionId: AIProviderDefinitionId;
  readonly modelId: string;
  readonly capabilities: AIModelCapabilityMap;
}

/**
 * Product-owned capability evidence for exact, supported provider/model pairs.
 *
 * This is a ProviderDefinition catalog projection, not proof from a provider's
 * model-list endpoint. Unknown and custom model ids intentionally have no
 * entry; they require a fresh provider API or runtime-probe snapshot instead.
 * The resolver stamps entries with `provider_catalog` provenance and an expiry
 * so changes to this product-owned evidence cannot be used indefinitely.
 */
export const AI_PROVIDER_MODEL_CAPABILITY_CATALOG: readonly AIProviderModelCapabilityDefinition[] =
  [
    {
      providerDefinitionId: 'openai',
      modelId: 'gpt-4o-mini',
      capabilities: {
        chat: 'verified',
        streaming: 'verified',
        structuredOutput: 'verified',
        toolCalling: 'verified',
        vision: 'verified',
      },
    },
    {
      providerDefinitionId: 'openai',
      modelId: 'gpt-4o',
      capabilities: {
        chat: 'verified',
        streaming: 'verified',
        structuredOutput: 'verified',
        toolCalling: 'verified',
        vision: 'verified',
      },
    },
    {
      providerDefinitionId: 'openrouter',
      modelId: 'openai/gpt-4o-mini',
      capabilities: {
        chat: 'verified',
        streaming: 'verified',
        structuredOutput: 'verified',
        toolCalling: 'verified',
        vision: 'verified',
      },
    },
    {
      providerDefinitionId: 'openrouter',
      modelId: 'google/gemini-2.5-flash',
      capabilities: {
        chat: 'verified',
        streaming: 'verified',
        structuredOutput: 'verified',
        toolCalling: 'verified',
        vision: 'verified',
      },
    },
    {
      providerDefinitionId: 'gemini',
      modelId: 'gemini-2.5-flash',
      capabilities: {
        chat: 'verified',
        streaming: 'verified',
        structuredOutput: 'verified',
        toolCalling: 'verified',
        vision: 'verified',
      },
    },
    {
      providerDefinitionId: 'gemini',
      modelId: 'gemini-2.5-pro',
      capabilities: {
        chat: 'verified',
        streaming: 'verified',
        structuredOutput: 'verified',
        toolCalling: 'verified',
        vision: 'verified',
      },
    },
    {
      providerDefinitionId: 'openrouter',
      modelId: 'google/gemini-2.5-pro',
      capabilities: {
        chat: 'verified',
        streaming: 'verified',
        structuredOutput: 'verified',
        toolCalling: 'verified',
        vision: 'verified',
      },
    },
    {
      providerDefinitionId: 'deepseek',
      modelId: 'deepseek-chat',
      capabilities: {
        chat: 'verified',
        streaming: 'verified',
        structuredOutput: 'verified',
        toolCalling: 'verified',
        vision: 'unsupported',
      },
    },
  ] as const;

export function getAIProviderModelCapabilityDefinition(
  providerDefinitionId: string,
  modelId: string,
): AIProviderModelCapabilityDefinition | undefined {
  return AI_PROVIDER_MODEL_CAPABILITY_CATALOG.find(
    (entry) => entry.providerDefinitionId === providerDefinitionId && entry.modelId === modelId,
  );
}
