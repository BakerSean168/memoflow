import { describe, expect, it } from 'vitest';
import {
  AssistantRuntimeClientCommandSchema,
  AssistantRuntimeEventSchema,
  AssistantRuntimeHistoryClientRequestSchema,
  AssistantRuntimeHistoryViewSchema,
  AIWorkflowCancelClientRequestSchema,
  AIWorkflowGetClientRequestSchema,
  AIWorkflowListClientRequestSchema,
  AIWorkflowResumeClientRequestSchema,
  AIWorkflowRunViewSchema,
  AIWorkflowStartClientRequestSchema,
} from './ai-runtime.dto';

describe('AI vNext runtime contracts', () => {
  it('rejects client identity injection for assistant commands', () => {
    const result = AssistantRuntimeClientCommandSchema.safeParse({
      type: 'message',
      conversationId: 'conversation-1',
      content: 'hello',
      surface: 'web',
      identityId: 'attacker-controlled',
    });

    expect(result.success).toBe(false);
  });

  it('rejects identity injection and private fields on assistant history transport', () => {
    expect(
      AssistantRuntimeHistoryClientRequestSchema.safeParse({
        conversationId: 'conversation-1',
        identityId: 'attacker-controlled',
      }).success,
    ).toBe(false);

    expect(
      AssistantRuntimeHistoryViewSchema.safeParse({
        conversationId: 'conversation-1',
        messages: [
          {
            id: 'message-1',
            conversationId: 'conversation-1',
            role: 'assistant',
            content: 'hello',
            createdAt: 1,
            providerMetadata: { apiKey: 'must-not-cross-boundary' },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires strictly monotonic-capable positive event sequences, rejects unknown event types, and strips credential-shaped extras', () => {
    const valid = AssistantRuntimeEventSchema.safeParse({
      eventId: 'run-1:1',
      runId: 'run-1',
      conversationId: 'conversation-1',
      sequence: 1,
      createdAt: 1,
      type: 'assistant.message.delta',
      data: { content: 'hi' },
    });
    const invalidSequence = AssistantRuntimeEventSchema.safeParse({
      eventId: 'run-1:0',
      runId: 'run-1',
      conversationId: 'conversation-1',
      sequence: 0,
      createdAt: 1,
      type: 'assistant.message.delta',
      data: { content: 'hi' },
    });
    const unknownType = AssistantRuntimeEventSchema.safeParse({
      eventId: 'run-1:2',
      runId: 'run-1',
      conversationId: 'conversation-1',
      sequence: 2,
      createdAt: 1,
      type: 'assistant.private.mastra.event',
      data: {},
    });

    expect(valid.success).toBe(true);
    expect(invalidSequence.success).toBe(false);
    expect(unknownType.success).toBe(false);

    const credentialAttempt = AssistantRuntimeEventSchema.parse({
      eventId: 'run-1:3',
      runId: 'run-1',
      conversationId: 'conversation-1',
      sequence: 3,
      createdAt: 1,
      type: 'assistant.run.started',
      data: { providerId: 'provider-1', apiKey: 'must-not-cross-boundary' },
      apiKey: 'must-not-cross-boundary',
    });
    expect(JSON.stringify(credentialAttempt)).not.toContain('must-not-cross-boundary');
    expect(JSON.stringify(credentialAttempt)).not.toContain('apiKey');
  });

  it('rejects identity injection on workflow resume and keeps resume commands typed', () => {
    expect(
      AIWorkflowResumeClientRequestSchema.safeParse({
        runId: 'workflow-1',
        command: { type: 'approve' },
        identityId: 'attacker-controlled',
      }).success,
    ).toBe(false);

    expect(
      AIWorkflowResumeClientRequestSchema.safeParse({
        runId: 'workflow-1',
        command: { type: 'revise_natural_language', instruction: 'make it smaller' },
      }).success,
    ).toBe(true);
  });

  it('rejects identity injection across every workflow transport request', () => {
    for (const result of [
      AIWorkflowStartClientRequestSchema.safeParse({
        kind: 'goal.create',
        conversationId: 'conversation-1',
        input: {},
        identityId: 'attacker-controlled',
      }),
      AIWorkflowGetClientRequestSchema.safeParse({
        runId: 'workflow-1',
        identityId: 'attacker-controlled',
      }),
      AIWorkflowListClientRequestSchema.safeParse({
        conversationId: 'conversation-1',
        identityId: 'attacker-controlled',
      }),
      AIWorkflowCancelClientRequestSchema.safeParse({
        runId: 'workflow-1',
        identityId: 'attacker-controlled',
      }),
    ]) {
      expect(result.success).toBe(false);
    }
  });

  it('projects only product workflow state and not framework snapshots', () => {
    const parsed = AIWorkflowRunViewSchema.parse({
      runId: 'workflow-1',
      kind: 'goal.create',
      conversationId: 'conversation-1',
      status: 'suspended',
      suspension: {
        type: 'clarification_required',
        questions: ['How much time can you spend each day?'],
      },
      createdAt: 1,
      updatedAt: 2,
    });

    expect(parsed.status).toBe('suspended');
    expect('snapshot' in parsed).toBe(false);
    expect('steps' in parsed).toBe(false);
  });

  it('rejects identity injection on knowledge.capture start request', () => {
    const result = AIWorkflowStartClientRequestSchema.safeParse({
      kind: 'knowledge.capture',
      conversationId: 'conversation-1',
      input: { topic: 'Mastra workflows', identityId: 'attacker-controlled' },
    });
    expect(result.success).toBe(false);
  });

  it('enforces vault-relative knowledge draft paths on the typed draft review suspension', () => {
    const absolute = AIWorkflowRunViewSchema.safeParse({
      runId: 'knowledge-1',
      kind: 'knowledge.capture',
      conversationId: 'conversation-1',
      status: 'suspended',
      suspension: {
        type: 'knowledge_draft_review',
        draft: {
          title: 'Mastra Workflows',
          topic: 'Reference',
          markdown: '# Mastra',
          knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440701',
          targetSubpath: '/var/local-vault/notes/mastra.md',
          revision: 1,
        },
        revision: 1,
      },
      createdAt: 1,
      updatedAt: 2,
    });
    expect(absolute.success).toBe(false);

    const relative = AIWorkflowRunViewSchema.safeParse({
      runId: 'knowledge-1',
      kind: 'knowledge.capture',
      conversationId: 'conversation-1',
      status: 'suspended',
      suspension: {
        type: 'knowledge_draft_review',
        draft: {
          title: 'Mastra Workflows',
          topic: 'Reference',
          markdown: '# Mastra',
          knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440701',
          targetSubpath: 'notes/mastra.md',
          revision: 1,
        },
        warnings: ['Duplicate risk'],
        revision: 1,
      },
      createdAt: 1,
      updatedAt: 2,
    });
    expect(relative.success).toBe(true);
  });

  it('accepts task.create recovery failures on the shared workflow view', () => {
    const parsed = AIWorkflowRunViewSchema.parse({
      runId: 'task-recovery-1',
      kind: 'task.create',
      conversationId: 'conversation-1',
      status: 'suspended',
      suspension: {
        type: 'recovery_required',
        message: 'The approved task plan could not be applied.',
        retryable: true,
        failures: [
          {
            operation: 'task_template',
            code: 'SERVICE_UNAVAILABLE',
            message: 'internal persistence detail',
            retryable: true,
          },
        ],
      },
      createdAt: 1,
      updatedAt: 2,
    });

    expect(parsed.kind).toBe('task.create');
    expect(parsed.suspension?.type).toBe('recovery_required');
    if (parsed.suspension?.type === 'recovery_required') {
      expect(parsed.suspension.failures[0]?.operation).toBe('task_template');
    }
  });

  it('projects typed knowledge.capture result receipt', () => {
    const parsed = AIWorkflowRunViewSchema.parse({
      runId: 'knowledge-1',
      kind: 'knowledge.capture',
      conversationId: 'conversation-1',
      status: 'completed',
      result: {
        workflowRunId: 'knowledge-1',
        revision: 1,
        status: 'success',
        noteId: 'knowledge-note-abc',
        notePath: 'notes/mastra.md',
        noteName: 'mastra.md',
        failures: [],
        retryable: false,
      },
      createdAt: 1,
      updatedAt: 2,
    });
    expect(parsed.status).toBe('completed');
    if (parsed.kind === 'knowledge.capture') {
      expect(parsed.result?.status).toBe('success');
      expect(parsed.result?.noteId).toBe('knowledge-note-abc');
    }
  });
});
