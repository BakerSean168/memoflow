import { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { useRouter } from 'expo-router';

import { useAIWorkspace } from '../hooks/useAIWorkspace';
import { useAppSession } from '../hooks/useAppSession';

import {
  PageShell,
  PrimaryButton,
  PrimaryTextField,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
  ThemedView,
} from '@memoflow/ui-react-native';

export function AIScreen() {
  const router = useRouter();
  const { signOut } = useAppSession();
  const {
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
  } = useAIWorkspace();
  const [conversationName, setConversationName] = useState('');
  const [messageDraft, setMessageDraft] = useState('');

  const selectedProvider = useMemo(
    () => providers.find((provider) => String(provider.id) === String(selectedProviderId)) ?? null,
    [providers, selectedProviderId],
  );

  async function handleCreateConversation() {
    const name = conversationName.trim();
    if (name.length === 0) {
      return;
    }

    const created = await createConversation(name);
    if (created) {
      setConversationName('');
    }
  }

  async function handleSendMessage() {
    const content = messageDraft.trim();
    if (content.length === 0) {
      return;
    }

    const ok = await sendMessage(content);
    if (ok) {
      setMessageDraft('');
    }
  }

  return (
    <PageShell
      eyebrow="More"
      title="AI workspace"
      subtitle="AI 页面现在已经接入 provider 选择、默认 provider 切换和流式消息发送。"
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}>
      <SectionCard title="Navigation" description="AI 先放在 More 栈，等移动端使用频率稳定后再评估是否提升。">
        <PrimaryButton label="Back to More" onPress={() => router.back()} variant="secondary" />
      </SectionCard>

      {!isRemoteAuthenticated ? (
        <SectionCard title="Remote sign-in required" description="AI 模块依赖远程认证会话。">
          <ThemedText type="small" themeColor="textSecondary">
            先退出当前 shell，然后用邮箱登录进入移动端，再回来查看 AI 会话。
          </ThemedText>
          <PrimaryButton fullWidth label="Return to sign-in" onPress={signOut} />
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Overview" description="当前会话、provider 和运行时能力都已经进入同一页。">
            <View style={styles.pillRow}>
              <StatusPill label={`${conversations.length} conversations`} tone="tint" />
              <StatusPill label={`${providers.length} providers`} tone="success" />
              <StatusPill
                label={capabilities ? capabilities.runtimeMode : 'runtime unknown'}
                tone="textSecondary"
              />
              <StatusPill label="Mastra stream" tone="success" />
            </View>
          </SectionCard>

          <SectionCard title="Provider" description="消息发送时可以选择 provider；默认模型来自已保存配置，完整模型目录按需读取而不缓存到 Provider。">
            {providers.length > 0 ? (
              <>
                <View style={styles.listColumn}>
                  {providers.map((provider) => (
                    <ThemedView key={provider.id} type="backgroundSelected" style={styles.itemCard}>
                      <View style={styles.messageHeader}>
                        <ThemedText type="smallBold">{provider.name}</ThemedText>
                        <View style={styles.pillRow}>
                          {provider.isDefault ? <StatusPill label="Default" tone="success" /> : null}
                          <StatusPill label={provider.providerDefinitionId} tone="textSecondary" />
                        </View>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        Base URL: {provider.baseUrl}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Model: {provider.defaultModel ?? 'No default model'}
                      </ThemedText>
                      <View style={styles.actionRow}>
                        <PrimaryButton
                          label={selectedProviderId === String(provider.id) ? 'Selected' : 'Use provider'}
                          onPress={() => {
                            setSelectedProviderId(String(provider.id));
                            setSelectedModel(provider.defaultModel ?? null);
                          }}
                          disabled={selectedProviderId === String(provider.id)}
                          variant={selectedProviderId === String(provider.id) ? 'ghost' : 'secondary'}
                        />
                        <PrimaryButton
                          label={provider.isDefault ? 'Default provider' : 'Set default'}
                          onPress={() => makeDefaultProvider(String(provider.id))}
                          disabled={isMutating || provider.isDefault}
                          variant="ghost"
                        />
                      </View>
                    </ThemedView>
                  ))}
                </View>

                {selectedProvider ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Selected model: {selectedModel ?? selectedProvider.defaultModel ?? 'No model selected'}. Model inventory is loaded on demand and is not stored on the Provider.
                  </ThemedText>
                ) : null}
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                当前账号还没有 AI provider 配置，先在 web 或 desktop 端配置 provider 再回来即可。
              </ThemedText>
            )}
          </SectionCard>

          <SectionCard title="New conversation" description="先显式创建会话，避免移动端空态里直接暴露复杂设置。">
            <PrimaryTextField
              value={conversationName}
              onChangeText={setConversationName}
              placeholder="Conversation name"
              hint="例如：Weekly planning"
            />
            <PrimaryButton
              label={isMutating ? 'Creating…' : 'Create conversation'}
              onPress={handleCreateConversation}
              disabled={isMutating || conversationName.trim().length === 0}
            />
          </SectionCard>

          {error ? (
            <SectionCard title="AI request failed" description="当前先直接显示错误。">
              <ThemedText type="small" themeColor="warning">
                {error}
              </ThemedText>
            </SectionCard>
          ) : null}

          <SectionCard title="Conversations" description="会话列表保持轻量，详情和消息历史在同页下方展示。">
            <View style={styles.listColumn}>
              {conversations.length > 0 ? (
                conversations.map((conversation) => (
                  <ThemedView key={conversation.id} type="backgroundSelected" style={styles.itemCard}>
                    <ThemedText type="smallBold">{conversation.name}</ThemedText>
                    <View style={styles.pillRow}>
                      <StatusPill label={conversation.status} tone="tint" />
                      <StatusPill label={`${conversation.messageCount} messages`} tone="textSecondary" />
                    </View>
                    <PrimaryButton
                      label={activeConversation?.id === conversation.id ? 'Active conversation' : 'Open conversation'}
                      onPress={() => selectConversation(String(conversation.id))}
                      disabled={isMutating || activeConversation?.id === conversation.id}
                      variant={activeConversation?.id === conversation.id ? 'ghost' : 'secondary'}
                    />
                  </ThemedView>
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  还没有 AI 会话，先创建一个新会话开始。
                </ThemedText>
              )}
            </View>
          </SectionCard>

          <SectionCard
            title={activeConversation ? activeConversation.name : 'Conversation detail'}
            description="消息已经支持流式输出，后续再补更细的 provider 管理和会话维护动作。">
            <View style={styles.listColumn}>
              {activeConversation?.messages && activeConversation.messages.length > 0 ? (
                activeConversation.messages.map((message) => (
                  <ThemedView
                    key={message.id}
                    type={message.isUser ? 'backgroundSelected' : 'backgroundElement'}
                    style={styles.messageCard}>
                    <View style={styles.messageHeader}>
                      <ThemedText type="smallBold">{message.isUser ? 'You' : message.isAssistant ? 'Assistant' : message.role}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {message.formattedTime}
                      </ThemedText>
                    </View>
                    <ThemedText type="small">{message.content || (isStreaming && message.isAssistant ? '...' : '')}</ThemedText>
                  </ThemedView>
                ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {activeConversation ? '当前会话还没有消息。' : '先从上面选择或创建一个会话。'}
                </ThemedText>
              )}
            </View>
          </SectionCard>

          <SectionCard title="Message composer" description="消息通过与 Web/Desktop 相同的 Mastra Assistant runtime 流式发送，provider 与 model 使用上面的选择结果。">
            <View style={styles.actionRow}>
              {selectedProvider ? <StatusPill label={selectedProvider.name} tone="tint" /> : null}
              {selectedModel ? <StatusPill label={selectedModel} tone="textSecondary" /> : null}
            </View>
            <PrimaryTextField
              value={messageDraft}
              onChangeText={setMessageDraft}
              placeholder="Ask the assistant"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              style={styles.multilineField}
            />
            <PrimaryButton
              label={isStreaming ? 'Streaming…' : isMutating ? 'Sending…' : 'Send message'}
              onPress={handleSendMessage}
              disabled={isMutating || isStreaming || messageDraft.trim().length === 0}
            />
          </SectionCard>
        </>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  listColumn: {
    gap: Spacing.three,
  },
  itemCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  messageCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  multilineField: {
    minHeight: 120,
  },
});
