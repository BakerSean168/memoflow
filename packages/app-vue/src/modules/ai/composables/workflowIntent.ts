import type { WorkflowMode } from './types';

/**
 * Conservative product-intent hinting for the unified composer.
 *
 * This is deliberately not a user-facing mode selector. It only promotes clear
 * create/capture/query requests into the existing durable workflows; ambiguous
 * prompts stay in normal chat. The runtime remains the authority for workflow
 * validation and all persistent writes still stop at their HITL approval gate.
 */
export function inferWorkflowMode(message: string): WorkflowMode {
  const text = message.trim().toLowerCase();
  if (!text) return 'chat';

  const goalNoun = /(目标|goal)/iu.test(text);
  const taskNoun = /(任务|待办|todo|task)/iu.test(text);
  const knowledgeNoun = /(知识库|知识|笔记|note|notes|knowledge base)/iu.test(text);

  const createVerb =
    /(创建|新建|添加|制定|设定|规划|拆解|起草|帮我做|create|add|plan|draft|set up)/iu;
  const captureVerb =
    /(整理|记录|保存|沉淀|捕获|写成|写一|生成.*笔记|整理成.*笔记|capture|save|turn.*into.*note|write.*note)/iu;
  const queryVerb =
    /(查询|搜索|查找|查一下|问一下|根据.*回答|基于.*回答|从.*找|search|query|ask|based on|according to)/iu;
  const explanatoryQuestion =
    /(如何|怎么|怎样|为什么|什么是|区别|教程|说明|解释|how\s+(?:do|to)|what\s+is|why|difference|explain)/iu;
  const directRequest =
    /(帮我|请(?:帮我)?|我想|我要|替我|给我|直接|please|i\s+want|i['’]?d\s+like|can\s+you|could\s+you)/iu;

  if (knowledgeNoun && queryVerb.test(text)) return 'knowledge-qa';

  // Questions about *how* to create/capture something are normal chat unless
  // the same message also contains an explicit request for MemoFlow to do it.
  const instructionOnly = explanatoryQuestion.test(text) && !directRequest.test(text);
  if (!instructionOnly && knowledgeNoun && captureVerb.test(text)) return 'knowledge-capture';
  if (!instructionOnly && goalNoun && createVerb.test(text)) return 'goal-create';
  if (!instructionOnly && taskNoun && createVerb.test(text)) return 'task-create';

  return 'chat';
}
