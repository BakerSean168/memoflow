import { useEffect, useState } from 'react';

import {
  MessageRole,
  type AICapabilities,
  type AIConversationClientDTO,
  type AIProviderConfigClientDTO,
  type AssistantRuntimeHistoryView,
  type AssistantRuntimeMessageView,
  type MessageClientDTO,
} from '@memoflow/contracts/ai';
import { unwrap } from '@memoflow/contracts/result';
import { presentErrorMessage } from '@memoflow/http-client';

import { useAppSession } from './useAppSession';
import { useAppClientRegistry } from '../providers/app-client-registry-provider';
import { getProductTime } from '../utils/product-time';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? presentErrorMessage(error) : 'AI request failed';
}

function formatMessageTime(timestamp: number) {
  return getProductTime().format.hm(timestamp);
}

function toMessageClientDTO(message: AssistantRuntimeMessageView): MessageClientDTO {
  const role =
    message.role === 'user'
      ? MessageRole.User
      : message.role === 'system'
        ? MessageRole.System
        : MessageRole.Assistant;
  return {
    id: message.id as MessageClientDTO['id'],
    conversationId: message.conversationId as MessageClientDTO['conversationId'],
    role,
    content: message.content,
    tokenCount: null,
    version: 1,
    createdAt: message.createdAt,
    updatedAt: message.createdAt,
    deletedAt: null,
    isUser: role === MessageRole.User,
    isAssistant: role === MessageRole.Assistant,
    isSystem: role === MessageRole.System,
    formattedTime: formatMessageTime(message.createdAt),
  };
}

function withRuntimeHistory(
  shell: AIConversationClientDTO,
  history: AssistantRuntimeHistoryView,
): AIConversationClientDTO {
  const messages = history.messages.map(toMessageClientDTO);
  return {
    ...shell,
    messages,
    messageCount: messages.length,
    lastMessageAt: messages[messages.length - 1]?.createdAt ?? shell.lastMessageAt,
  };
}

/** Mobile projection of the canonical Mastra Assistant runtime. */
export function useAIWorkspace() {
  const { aiClient, aiAssistantRuntime: runtime } = useAppClientRegistry();
  const { isRemoteAuthenticated } = useAppSession();
  const [conversations, setConversations] = useState<AIConversationClientDTO[]>([]);
  const [activeConversation, setActiveConversation] = useState<AIConversationClientDTO | null>(null);
  const [providers, setProviders] = useState<AIProviderConfigClientDTO[]>([]);
  const [capabilities, setCapabilities] = useState<AICapabilities | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(isRemoteAuthenticated);
  const [isMutating, setIsMutating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resolveSelectedProvider(
    nextProviders: AIProviderConfigClientDTO[],
    preferredProviderId?: string | null,
  ) {
    const preferred =
      nextProviders.find((provider) => String(provider.id) === String(preferredProviderId)) ??
      nextProviders.find((provider) => String(provider.id) === String(selectedProviderId)) ??
      nextProviders.find((provider) => provider.isDefault) ??
      nextProviders[0] ??
      null;

    setSelectedProviderId(preferred ? String(preferred.id) : null);
    setSelectedModel(preferred?.defaultModel ?? null);
  }

  async function fetchConversation(id: string): Promise<AIConversationClientDTO> {
    const [shellResult, history] = await Promise.all([
      aiClient.getConversation(id),
      runtime.listMessages(id),
    ]);
    return withRuntimeHistory(unwrap(shellResult), history);
  }

  async function loadConversation(id: string) {
    try {
      setActiveConversation(await fetchConversation(id));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    }
  }

  async function loadWorkspace(preferredConversationId?: string | null) {
    if (!isRemoteAuthenticated) {
      setConversations([]);
      setActiveConversation(null);
      setProviders([]);
      setCapabilities(null);
      setSelectedProviderId(null);
      setSelectedModel(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [listResult, providersResult, capabilitiesResult] = await Promise.all([
        aiClient.listConversations({ page: 1, pageSize: 20 }),
        aiClient.listProviders(),
        aiClient.getCapabilities(),
      ]);
      const list = unwrap(listResult);
      const nextProviders = unwrap(providersResult);
      const nextCapabilities = unwrap(capabilitiesResult);

      setConversations(list.data);
      setProviders(nextProviders);
      setCapabilities(nextCapabilities);
      resolveSelectedProvider(nextProviders);

      const targetId =
        preferredConversationId ?? activeConversation?.id ?? list.data[0]?.id ?? null;
      setActiveConversation(targetId ? await fetchConversation(String(targetId)) : null);
    } catch (loadError) {
      setConversations([]);
      setActiveConversation(null);
      setProviders([]);
      setCapabilities(null);
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, [isRemoteAuthenticated]);

  async function refresh() {
    await loadWorkspace();
  }

  async function createConversation(name: string) {
    setIsMutating(true);
    setError(null);
    try {
      const conversation = unwrap(await aiClient.createConversation({ name }));
      await loadWorkspace(String(conversation.id));
      return conversation;
    } catch (createError) {
      setError(getErrorMessage(createError));
      return null;
    } finally {
      setIsMutating(false);
    }
  }

  async function selectConversation(id: string) {
    setIsMutating(true);
    setError(null);
    try {
      await loadConversation(id);
      return true;
    } catch (selectError) {
      setError(getErrorMessage(selectError));
      return false;
    } finally {
      setIsMutating(false);
    }
  }

  async function makeDefaultProvider(providerId: string) {
    setIsMutating(true);
    setError(null);
    try {
      unwrap(await aiClient.setDefaultProvider(providerId));
      const nextProviders = unwrap(await aiClient.listProviders());
      setProviders(nextProviders);
      resolveSelectedProvider(nextProviders, providerId);
      return true;
    } catch (providerError) {
      setError(getErrorMessage(providerError));
      return false;
    } finally {
      setIsMutating(false);
    }
  }

  async function sendMessage(content: string) {
    setIsMutating(true);
    setIsStreaming(true);
    setError(null);

    try {
      const shell =
        activeConversation ??
        unwrap(
          await aiClient.createConversation({
            name: content.slice(0, 40) || 'New conversation',
          }),
        );
      const conversationId = String(shell.id);
      const timestamp = Date.now();
      const optimisticUser: MessageClientDTO = {
        id: `draft-user-${timestamp}` as MessageClientDTO['id'],
        conversationId: shell.id,
        role: MessageRole.User,
        content,
        tokenCount: null,
        version: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        isUser: true,
        isAssistant: false,
        isSystem: false,
        formattedTime: formatMessageTime(timestamp),
      };
      const optimisticAssistant: MessageClientDTO = {
        id: `draft-assistant-${timestamp}` as MessageClientDTO['id'],
        conversationId: shell.id,
        role: MessageRole.Assistant,
        content: '',
        tokenCount: null,
        version: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        isUser: false,
        isAssistant: true,
        isSystem: false,
        formattedTime: formatMessageTime(timestamp),
      };
      setActiveConversation({
        ...shell,
        messages: [...(activeConversation?.messages ?? []), optimisticUser, optimisticAssistant],
        messageCount: (activeConversation?.messages?.length ?? 0) + 2,
        lastMessageAt: timestamp,
      });

      let runtimeFailure: string | null = null;
      await runtime.streamMessage(
        {
          type: 'message',
          conversationId,
          content,
          surface: 'mobile',
          providerId: selectedProviderId ?? undefined,
          modelId: selectedModel ?? undefined,
        },
        {
          onEvent: (event) => {
            if (event.type === 'assistant.message.delta') {
              setActiveConversation((current) => {
                if (!current?.messages?.length) return current;
                const messages = [...current.messages];
                const last = messages[messages.length - 1];
                if (!last?.isAssistant) return current;
                messages[messages.length - 1] = {
                  ...last,
                  content: `${last.content}${event.data.content}`,
                };
                return { ...current, messages };
              });
            } else if (event.type === 'assistant.run.completed') {
              setActiveConversation((current) => {
                if (!current?.messages?.length) return current;
                const messages = [...current.messages];
                const last = messages[messages.length - 1];
                if (!last?.isAssistant) return current;
                messages[messages.length - 1] = {
                  ...last,
                  id: (event.data.assistantMessageId ?? last.id) as MessageClientDTO['id'],
                  content: event.data.content || last.content,
                };
                return { ...current, messages };
              });
            } else if (event.type === 'assistant.run.failed') {
              runtimeFailure = event.data.message || 'AI runtime failed';
            }
          },
        },
      );

      if (runtimeFailure) throw new Error(runtimeFailure);
      await loadWorkspace(conversationId);
      return true;
    } catch (sendError) {
      setError(getErrorMessage(sendError));
      return false;
    } finally {
      setIsStreaming(false);
      setIsMutating(false);
    }
  }

  return {
    activeConversation,
    capabilities,
    conversations,
    createConversation,
    error,
    isLoading,
    isMutating,
    isRemoteAuthenticated,
    isStreaming,
    makeDefaultProvider,
    providers,
    refresh,
    selectConversation,
    selectedModel,
    selectedProviderId,
    sendMessage,
    setSelectedModel,
    setSelectedProviderId,
  };
}
