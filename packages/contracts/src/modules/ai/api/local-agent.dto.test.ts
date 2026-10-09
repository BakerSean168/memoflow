import { describe, expect, it } from 'vitest';
import {
  AssistantConversationRefSchema,
  AssistantRuntimeChoiceSchema,
  LocalAgentConnectionInputSchema,
  LocalAgentRequestResponseSchema,
} from './local-agent.dto';
import { AssistantToolNameSchema } from './assistant-runtime.dto';
import { AssistantRuntimeEventSchema } from './assistant-events.dto';

describe('selectable assistant runtime contracts', () => {
  it('keeps model providers distinct from local Agent connections', () => {
    expect(AssistantRuntimeChoiceSchema.parse({ runtimeKind: 'builtin' })).toEqual({
      runtimeKind: 'builtin',
    });
    expect(
      AssistantRuntimeChoiceSchema.safeParse({
        runtimeKind: 'local_agent',
        connectionId: 'codex-1',
        modelId: 'model',
      }).success,
    ).toBe(true);
    expect(
      AssistantRuntimeChoiceSchema.safeParse({
        runtimeKind: 'local_agent',
        providerId: 'api-key-provider',
      }).success,
    ).toBe(false);
  });

  it('rejects host identity and native session injection in conversation references', () => {
    const ref = { runtimeKind: 'local_agent', id: 'conversation-1' };
    expect(AssistantConversationRefSchema.parse(ref)).toEqual(ref);
    for (const extra of [
      { identityId: 'another-owner' },
      { nativeSessionId: 'native-1' },
      { homePath: '/another/profile' },
    ]) {
      expect(AssistantConversationRefSchema.safeParse({ ...ref, ...extra }).success).toBe(false);
    }
  });

  it('accepts explicit binary configuration without accepting arbitrary shell arguments or credentials', () => {
    const connection = {
      driver: 'codex',
      name: 'My Codex',
      executablePath: '/a path/codex',
      enabled: true,
    };
    expect(LocalAgentConnectionInputSchema.parse(connection).writeScopes).toEqual([]);
    expect(
      LocalAgentConnectionInputSchema.safeParse({
        ...connection,
        args: ['--dangerously-bypass-approvals-and-sandbox'],
      }).success,
    ).toBe(false);
    expect(
      LocalAgentConnectionInputSchema.safeParse({ ...connection, apiKey: 'secret' }).success,
    ).toBe(false);
  });

  it('displays native tool activity without adding it to executable MemoFlow tool names', () => {
    expect(AssistantToolNameSchema.safeParse('shell').success).toBe(false);
    expect(
      AssistantRuntimeEventSchema.safeParse({
        eventId: 'event-1',
        conversationId: 'conversation-1',
        runId: 'run-1',
        sequence: 1,
        createdAt: 1,
        type: 'assistant.activity',
        data: {
          activityType: 'native_tool',
          toolCallId: 'tool-1',
          label: 'shell',
          state: 'running',
        },
      }).success,
    ).toBe(true);
  });

  it('binds native responses to a conversation, run and request instead of a model-supplied approval', () => {
    expect(
      LocalAgentRequestResponseSchema.safeParse({
        conversationId: 'conversation-1',
        runId: 'run-1',
        requestId: 'request-1',
        response: { type: 'permission', decision: 'approve_once' },
      }).success,
    ).toBe(true);
    expect(LocalAgentRequestResponseSchema.safeParse({ approved: true }).success).toBe(false);
  });
});
