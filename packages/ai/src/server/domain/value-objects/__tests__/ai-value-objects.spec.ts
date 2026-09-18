import { describe, expect, it } from 'vitest';
import { AIModel } from '../ai-model';
import { AiConversationId } from '../ai-conversation-id';
import { AiGenerationTaskId } from '../ai-generation-task-id';
import { AiMessageId } from '../ai-message-id';
import { AIProvider } from '../ai-provider';
import { AiProviderConfigId } from '../ai-provider-config-id';
import { AIProviderType } from '../ai-provider-type';
import { AiUsageQuotaId } from '../ai-usage-quota-id';
import { ConversationStatus } from '../conversation-status';
import { MessageRole } from '../message-role';

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
    expect(AIModel.isGPT(AIModel.Claude3Opus)).toBe(false);
    expect(AIModel.isClaude(AIModel.Claude3Haiku)).toBe(true);
    expect(AIModel.isClaude(AIModel.Gpt4Turbo)).toBe(false);
    expect(() => AIModel.of('gemini-pro')).toThrow('Invalid AIModel');

    expect(AIProviderType.getAll()).toEqual([AIProviderType.OpenAICompatible]);
    expect(AIProviderType.of('openai_compatible')).toBe(AIProviderType.OpenAICompatible);
    expect(AIProviderType.isValid('openai_compatible')).toBe(true);
    expect(AIProviderType.isValid('native')).toBe(false);
    expect(AIProviderType.isOpenAICompatible(AIProviderType.OpenAICompatible)).toBe(true);
    expect(() => AIProviderType.of('native')).toThrow('Invalid AIProviderType');

    expect(AIProvider.getAll()).toEqual([
      AIProvider.OpenAI,
      AIProvider.Anthropic,
      AIProvider.Custom,
    ]);
    expect(AIProvider.of('Anthropic')).toBe(AIProvider.Anthropic);
    expect(AIProvider.isValid('Custom')).toBe(true);
    expect(AIProvider.isValid('Azure')).toBe(false);
    expect(AIProvider.isOpenAI(AIProvider.OpenAI)).toBe(true);
    expect(AIProvider.isAnthropic(AIProvider.Anthropic)).toBe(true);
    expect(AIProvider.isCustom(AIProvider.Custom)).toBe(true);
    expect(() => AIProvider.of('Azure')).toThrow('Invalid AIProvider');
  });

  it('covers conversation and message status helpers', () => {
    expect(ConversationStatus.getAll()).toEqual([
      ConversationStatus.Active,
      ConversationStatus.Archived,
    ]);
    expect(ConversationStatus.of('Active')).toBe(ConversationStatus.Active);
    expect(ConversationStatus.isValid('Closed')).toBe(false);
    expect(ConversationStatus.isValid('Paused')).toBe(false);
    expect(ConversationStatus.isActive(ConversationStatus.Active)).toBe(true);
    expect(ConversationStatus.isArchived(ConversationStatus.Archived)).toBe(true);
    expect(() => ConversationStatus.of('Paused')).toThrow('Invalid ConversationStatus');

    expect(MessageRole.getAll()).toEqual([
      MessageRole.User,
      MessageRole.Assistant,
      MessageRole.System,
    ]);
    expect(MessageRole.of('Assistant')).toBe(MessageRole.Assistant);
    expect(MessageRole.isValid('User')).toBe(true);
    expect(MessageRole.isValid('Tool')).toBe(false);
    expect(MessageRole.isUser(MessageRole.User)).toBe(true);
    expect(MessageRole.isAssistant(MessageRole.Assistant)).toBe(true);
    expect(MessageRole.isSystem(MessageRole.System)).toBe(true);
    expect(() => MessageRole.of('Tool')).toThrow('Invalid MessageRole');
  });

  it('covers branded id helpers that participate in governed coverage', () => {
    const conversationId = AiConversationId.generate();
    expect(AiConversationId.is(conversationId)).toBe(true);
    expect(AiConversationId.of(conversationId)).toBe(conversationId);

    const messageId = AiMessageId.generate();
    expect(AiMessageId.is(messageId)).toBe(true);
    expect(AiMessageId.of(messageId)).toBe(messageId);

    const providerConfigId = AiProviderConfigId.generate();
    expect(AiProviderConfigId.is(providerConfigId)).toBe(true);
    expect(AiProviderConfigId.of(providerConfigId)).toBe(providerConfigId);

    const generationTaskId = AiGenerationTaskId.generate();
    expect(AiGenerationTaskId.is(generationTaskId)).toBe(true);
    expect(AiGenerationTaskId.of(generationTaskId)).toBe(generationTaskId);

    const usageQuotaId = AiUsageQuotaId.generate();
    expect(AiUsageQuotaId.is(usageQuotaId)).toBe(true);
    expect(AiUsageQuotaId.of(usageQuotaId)).toBe(usageQuotaId);
  });
});
