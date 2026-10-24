import {
  AIProviderType as AIProviderTypeContract,
  type AIProviderType as IAIProviderType,
} from '@memoflow/contracts/ai';

export type AIProviderType = IAIProviderType & { readonly __brand: unique symbol };

// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: IAIProviderType[] = Object.values(AIProviderTypeContract);

export const AIProviderType = {
  OpenAICompatible: 'openai_compatible' as AIProviderType,

  of(value: string): AIProviderType {
    if (!this.isValid(value)) {
      throw new Error(`Invalid AIProviderType: ${value}`);
    }
    return value as AIProviderType;
  },

  isValid(value: string): value is AIProviderType {
    return VALUES.includes(value as IAIProviderType);
  },

  getAll(): AIProviderType[] {
    return VALUES as AIProviderType[];
  },

  isOpenAICompatible(providerType: AIProviderType): boolean {
    return providerType === this.OpenAICompatible;
  },
};
