import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AI-VNEXT-03 / ADR-120: builtin chat remains Mastra-native. The
 * transitional AIClientService remains available to non-migrated workflows,
 * but default chat must never re-enter AssistantFacade/DirectTurn/Pi profiles.
 */
describe('useAIChatSession runtime-owned open chat surface', () => {
  const session = [
    'useAIChatSession.ts',
    'useAssistantStream.ts',
    'useConversationProjection.ts',
    'useAIComposerContext.ts',
  ]
    .map((file) => readFileSync(resolve(__dirname, file), 'utf8'))
    .join('\n');
  const types = readFileSync(resolve(__dirname, 'types.ts'), 'utf8');
  const composer = readFileSync(resolve(__dirname, '../components/AIFooterComposer.vue'), 'utf8');
  const chatView = readFileSync(resolve(__dirname, '../views/AIChatView.vue'), 'utf8');
  const viewComposable = readFileSync(resolve(__dirname, 'useAIChatView.ts'), 'utf8');
  const webDi = readFileSync(
    resolve(__dirname, '../../../../../../apps/web/src/platform/di-app.ts'),
    'utf8',
  );
  const desktopDi = readFileSync(
    resolve(__dirname, '../../../../../../apps/desktop/src/renderer/platform/di-app.ts'),
    'utf8',
  );

  it('routes open-chat history/stream/cancel/delete through the dedicated AssistantRuntimeClient', () => {
    expect(session).toContain('runtime: AssistantRuntimeClient');
    expect(session).toContain('options.runtime.listMessages(conversationId)');
    expect(session).toContain('options.runtime.deleteConversation(id)');
    expect(session).toContain('options.runtime.streamMessage(');
    expect(session).toContain('options.runtime.cancelRun(runId)');
    expect(session).toContain('providerId: selectedModel!.providerId');
    expect(session).toContain('modelId: selectedModel!.modelId');
    expect(session).toContain("{ runtimeKind: 'local_agent', modelId: choice.modelId }");
    expect(session).toContain('options.runtime.listMessages(conversationId, kind)');
    expect(session).toContain("event.type === 'assistant.message.delta'");
    expect(session).toContain("event.type === 'assistant.usage.updated'");
    expect(session).toContain("event.type === 'assistant.run.completed'");
    expect(session).not.toContain('useAssistantDispatch');
    expect(session).not.toMatch(/loadService\.dispatchAssistant\s*\(/);
    expect(session).not.toMatch(/loadService\.streamMessage\s*\(/);
    expect(session).not.toMatch(/loadService\.sendMessage\s*\(/);
    expect(types).not.toMatch(/'\s*streamMessage\s*'/);
    expect(types).not.toMatch(/'\s*listMessages\s*'/);
  });

  it('injects a separate runtime service on Web and Desktop instead of hiding Mastra behind AIClientService', () => {
    expect(viewComposable).toContain('AI_ASSISTANT_RUNTIME_KEY');
    expect(viewComposable).toContain(
      "useStrictInject(AI_ASSISTANT_RUNTIME_KEY, 'AIAssistantRuntime')",
    );
    expect(webDi).toContain('createAssistantRuntimeHttpClient');
    expect(webDi).toContain('AI_ASSISTANT_RUNTIME_KEY');
    expect(desktopDi).toContain('createAssistantRuntimeIpcClient');
    expect(desktopDi).toContain('AI_ASSISTANT_RUNTIME_KEY');
  });

  it('removes DirectTurn/pi_readonly as open-chat product controls and uses runtime-owned run ids for cancel', () => {
    expect(composer).not.toContain('ai-chat-execution-profile');
    expect(composer).not.toContain('value="pi_readonly"');
    expect(composer).not.toContain('value="direct_turn"');
    expect(composer).not.toContain("'select-execution-profile'");
    expect(chatView).not.toContain(':execution-profile-id="executionProfileId"');
    expect(chatView).not.toContain('@select-execution-profile="selectExecutionProfile"');
    expect(session).toContain('activeRuntimeRunId');
    expect(session).not.toContain('activeHostRunId');
    expect(session).not.toContain('createHostOpenChatRunId');
    expect(session).not.toContain('buildHostOpenChatStopCancelCommand');
    expect(composer).toContain('ai-chat-stop-generating');
    expect(chatView).toContain('@stop="stopGenerating"');
  });

  it('documents the Mastra runtime path and forbids legacy open-chat fallback', () => {
    const pathMap = readFileSync(
      resolve(__dirname, '../../../../../../docs/architecture/ai-runtime-path-map.md'),
      'utf8',
    );
    expect(pathMap).toContain('AssistantRuntimeClient');
    expect(pathMap).toContain('/ai/runtime/assistant/sse');
    expect(pathMap).toContain('/ai/runtime/assistant/history');
    expect(pathMap).toContain('/ai/runtime/assistant/delete');
    expect(pathMap).toContain('Mastra');
    expect(pathMap).toContain('默认聊天回退 `AIClientService.dispatchAssistant`');
    expect(session).not.toContain('dispatchAssistant');
  });
});
