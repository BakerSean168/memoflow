/**
 * AI 提供商
 */
export const AIProvider = {
  OpenAI: 'OpenAI',
  Anthropic: 'Anthropic',
  Custom: 'Custom',
} as const;

export type AIProvider = (typeof AIProvider)[keyof typeof AIProvider];
