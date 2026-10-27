/**
 * AI 模型
 */
export const AIModel = {
  Gpt4: 'gpt-4',
  Gpt4Turbo: 'gpt-4-turbo-preview',
  Gpt35Turbo: 'gpt-3.5-turbo',
  Claude3Opus: 'claude-3-opus-20240229',
  Claude3Sonnet: 'claude-3-sonnet-20240229',
  Claude3Haiku: 'claude-3-haiku-20240307',
} as const;

export type AIModel = (typeof AIModel)[keyof typeof AIModel];
