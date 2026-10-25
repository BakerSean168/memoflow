import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useAIKnowledgeQaWorkflow } from './useAIKnowledgeQaWorkflow';
import type { ChatItem } from './types';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

describe('knowledge question input', () => {
  it('keeps the actual question after a long pasted plan within the query limit', () => {
    const question = '基于知识库回答：如何安排最后一个学习阶段？';
    const timeline = ref<ChatItem[]>([
      {
        id: 'u',
        role: 'user',
        status: 'success',
        content: '学习方案正文。'.repeat(400) + question,
      },
      { id: 'a', role: 'assistant', status: 'success', content: 'Acknowledged' },
    ]);
    const workflow = useAIKnowledgeQaWorkflow({
      service: { queryKnowledge: vi.fn() },
      selectedModel: ref(null),
      chatConversationId: ref('c'),
      chatLoading: ref(false),
      chatTimeline: timeline,
      hasWorkflowUserMessages: ref(true),
      scrollMessagesToBottom: vi.fn(),
      requestOpenKnowledgeNote: vi.fn(),
    });
    expect(workflow.buildKnowledgeQuestion()).toHaveLength(2000);
    expect(workflow.buildKnowledgeQuestion().endsWith(question)).toBe(true);
    timeline.value[0].content = question;
    expect(workflow.buildKnowledgeQuestion()).toBe(question);
    timeline.value = [];
    expect(workflow.buildKnowledgeQuestion()).toBe('');
  });
});
