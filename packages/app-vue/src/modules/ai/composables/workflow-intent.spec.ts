import { describe, expect, it } from 'vitest';
import { inferWorkflowMode } from './workflow-intent';

describe('inferWorkflowMode', () => {
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
