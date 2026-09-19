import { describe, expect, it } from 'vitest';
import { AIModel } from '../ai-model';
import { AiConversationId } from '../ai-conversation-id';
import { AIProvider } from '../ai-provider';
import { AiProviderConfigId } from '../ai-provider-config-id';
import { AIProviderType } from '../ai-provider-type';
import { ConversationStatus } from '../conversation-status';

describe('ai value objects', () => {
  it('covers ai model and provider enums', () => {
    expect(AIModel.getAll()).toEqual([
      AIModel.Gpt4,
      AIModel.Gpt4Turbo,
      AIModel.Gpt35Turbo,
      AIModel.Claude3Opus,
      AIModel.Claude3Sonnet,
      AIModel.Claude3Haiku,
    ]);
    expect(AIModel.of('gpt-4')).toBe(AIModel.Gpt4);
    expect(AIModel.isValid('claude-3-sonnet-20240229')).toBe(true);
    expect(AIModel.isValid('gemini-pro')).toBe(false);
    expect(AIModel.isGPT(AIModel.Gpt35Turbo)).toBe(true);
    expect(AIModel.isClaude(AIModel.Claude3Haiku)).toBe(true);

    expect(AIProviderType.getAll()).toEqual([AIProviderType.OpenAICompatible]);
    expect(AIProviderType.of('openai_compatible')).toBe(AIProviderType.OpenAICompatible);
    expect(AIProviderType.isOpenAICompatible(AIProviderType.OpenAICompatible)).toBe(true);

    expect(AIProvider.getAll()).toEqual([AIProvider.OpenAI, AIProvider.Anthropic, AIProvider.Custom]);
    expect(AIProvider.of('Anthropic')).toBe(AIProvider.Anthropic);
    expect(AIProvider.isOpenAI(AIProvider.OpenAI)).toBe(true);
    expect(AIProvider.isAnthropic(AIProvider.Anthropic)).toBe(true);
    expect(AIProvider.isCustom(AIProvider.Custom)).toBe(true);
  });

  it('covers the surviving conversation status helpers', () => {
    expect(ConversationStatus.getAll()).toEqual([
      ConversationStatus.Active,
      ConversationStatus.Archived,
    ]);
    expect(ConversationStatus.of('Active')).toBe(ConversationStatus.Active);
    expect(ConversationStatus.isActive(ConversationStatus.Active)).toBe(true);
    expect(ConversationStatus.isArchived(ConversationStatus.Archived)).toBe(true);
    expect(() => ConversationStatus.of('Paused')).toThrow('Invalid ConversationStatus');
  });

  it('covers surviving branded ids', () => {
    const conversationId = AiConversationId.generate();
    expect(AiConversationId.is(conversationId)).toBe(true);
    expect(AiConversationId.of(conversationId)).toBe(conversationId);

    const providerConfigId = AiProviderConfigId.generate();
    expect(AiProviderConfigId.is(providerConfigId)).toBe(true);
    expect(AiProviderConfigId.of(providerConfigId)).toBe(providerConfigId);
  });
});
