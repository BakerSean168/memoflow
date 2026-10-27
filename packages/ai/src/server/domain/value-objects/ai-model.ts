import { AIModel as AIModelContract, type AIModel as IAIModel } from '@memoflow/ai-contracts';

/**
 * AIModel 枚举类型
 *
 * 【规范说明：枚举与常量对象规范】
 */

export type AIModel = IAIModel & { readonly __brand: unique symbol };

// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: IAIModel[] = Object.values(AIModelContract);

export const AIModel = {
  Gpt4: 'gpt-4' as AIModel,
  Gpt4Turbo: 'gpt-4-turbo-preview' as AIModel,
  Gpt35Turbo: 'gpt-3.5-turbo' as AIModel,
  Claude3Opus: 'claude-3-opus-20240229' as AIModel,
  Claude3Sonnet: 'claude-3-sonnet-20240229' as AIModel,
  Claude3Haiku: 'claude-3-haiku-20240307' as AIModel,

  of(value: string): AIModel {
    if (!this.isValid(value)) {
      throw new Error(`Invalid AIModel: ${value}`);
    }
    return value as AIModel;
  },

  isValid(value: string): value is AIModel {
    return VALUES.includes(value as IAIModel);
  },

  getAll(): AIModel[] {
    return VALUES as AIModel[];
  },

  isGPT(model: AIModel): boolean {
    return model.startsWith('gpt');
  },

  isClaude(model: AIModel): boolean {
    return model.startsWith('claude');
  },
};
