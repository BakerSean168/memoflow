export const AIProviderType = {
  OpenAICompatible: 'openai_compatible',
} as const;

export type AIProviderType = (typeof AIProviderType)[keyof typeof AIProviderType];
