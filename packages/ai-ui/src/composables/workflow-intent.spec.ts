import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
import { describe, expect, it } from 'vitest';
import { inferWorkflowMode } from './workflowIntent';

describe('inferWorkflowMode', () => {
  it('routes the issue #569 pasted plan by its final instruction', () => {
    expect(
      inferWorkflowMode(`目标名称：掌握前端、全栈与 AI Agent 应用开发，独立交付完整产品
建议贯穿开发一个「个人知识与任务助手」
完成知识条目管理页面，具备搜索、本地存储、错误处理和关键逻辑测试
我复制了，另一个会话的信息，帮我创建一下目标`),
    ).toBe('goal-create');
  });

  it.each([
    ['帮我规划一个学习目标，先讨论不要创建', 'chat'],
    ['帮我创建目标。先讨论', 'chat'],
    ['> 帮我创建目标\n先讨论不要创建', 'chat'],
    ['```\n帮我创建目标\n```', 'chat'],
    ['目标方案：个人知识助手，支持搜索\n你帮我规划一下吧，确认写入', 'goal-create'],
    ['知识库搜索方案\n帮我创建目标并添加学习 Routine', 'goal-create'],
    ['帮我创建目标\n请搜索知识库相关资料', 'knowledge-qa'],
  ] as const)('uses the current instruction: %s', (message, mode) => {
    expect(inferWorkflowMode(message)).toBe(mode);
  });

  it('resolves confirmation against the preceding plan without inventing an object', () => {
    expect(inferWorkflowMode('确认写入', '目标名称：学习前端')).toBe('goal-create');
    expect(inferWorkflowMode('确认写入')).toBe('chat');
    expect(inferWorkflowMode('先讨论不要创建', '目标名称：学习前端')).toBe('chat');
  });
  it.each([
    ['帮我规划一个十月份找到前端工作的目标', 'goal-create'],
    ['创建一个任务：明天整理周报', 'task-create'],
    ['把下面这些内容整理成一篇知识笔记', 'knowledge-capture'],
    ['基于我的知识库回答这个问题', 'knowledge-qa'],
    ['plan a goal for the next quarter', 'goal-create'],
    ['create a task to review the release', 'task-create'],
    ['如何创建目标？请帮我直接建一个十月求职目标', 'goal-create'],
  ] as const)('maps %s to %s', (message, mode) => {
    expect(inferWorkflowMode(message)).toBe(mode);
  });

  it.each([
    '分析一下这个目标为什么进度慢',
    '这个任务为什么失败了',
    '今天有什么安排',
    '解释一下 goal 和 task 的区别',
    '如何创建一个目标？',
    '怎么添加任务？',
    'how to create a goal',
    'explain how to write a knowledge note',
  ])('keeps ambiguous/read-only prompts in chat: %s', (message) => {
    expect(inferWorkflowMode(message)).toBe('chat');
  });
});
