/**
 * AI prompt templates.
 * @module @/infrastructure-client/prompts
 */

/** Task decomposition system prompt. */
export const TASK_DECOMPOSITION_SYSTEM_PROMPT = `你是一个专业的项目管理和任务规划专家。

当用户给你一个目标或大任务时，你需要：
1. 将其分解为3-10个具体可执行的子任务
2. 每个子任务需要有清晰的标题、详细描述
3. 评估每个任务的复杂度 (简单/中等/复杂)
4. 预估每个任务的时间消耗（分钟）
5. 识别任务间的依赖关系
6. 建议合理的执行顺序
7. 识别潜在风险并提供缓解方案

你的输出必须是有效的JSON格式，包含以下结构：
{
  "tasks": [
    {
      "title": "任务标题",
      "description": "详细描述",
      "estimatedMinutes": 数字,
      "complexity": "simple|medium|complex",
      "dependencies": ["依赖的任务标题"],
      "suggestedOrder": 数字
    }
  ],
  "timeline": {
    "totalEstimatedHours": 数字,
    "estimatedDays": 数字
  },
  "risks": [
    {
      "description": "风险描述",
      "mitigation": "缓解方案"
    }
  ],
  "confidence": 0.95
}

重点考虑：
- 任务应该是具体的、可测量的
- 避免任务过于简单或过于复杂
- 考虑实际可行性，不要过于乐观
- 类似的子任务应该分组`;

/** Task decomposition user prompt template. */
export const TASK_DECOMPOSITION_USER_PROMPT_TEMPLATE = (
  goalTitle: string,
  goalDescription: string,
  goalDeadline?: Date,
  existingTasks?: string[],
  userContext?: {
    workHoursPerDay?: number;
    skillLevel?: string;
  },
): string => {
  const lines: string[] = [];

  lines.push(`我需要将以下目标分解成具体的子任务：\n`);
  lines.push(`**目标标题**: ${goalTitle}\n`);

  if (goalDescription) {
    lines.push(`**目标描述**: ${goalDescription}\n`);
  }

  if (goalDeadline) {
    const deadline =
      goalDeadline instanceof Date
        ? goalDeadline.toLocaleDateString('zh-CN')
        : new Date(goalDeadline).toLocaleDateString('zh-CN');
    lines.push(`**截止日期**: ${deadline}\n`);
  }

  if (userContext?.workHoursPerDay) {
    lines.push(`**每日可用工作时间**: ${userContext.workHoursPerDay} 小时\n`);
  }

  if (userContext?.skillLevel) {
    lines.push(`**技能水平**: ${userContext.skillLevel}\n`);
  }

  if (existingTasks && existingTasks.length > 0) {
    lines.push(`\n**已有相关任务（避免重复）**:\n`);
    existingTasks.forEach((task) => {
      lines.push(`- ${task}\n`);
    });
  }

  lines.push(`\n请为我分解这个目标，给出具体的子任务清单。`);

  return lines.join('');
};

/** Time estimation prompt. */
export const TIME_ESTIMATION_PROMPT = (taskDescription: string): string => {
  return `基于以下任务描述，预估其完成时间（单位：分钟）：
  
**任务**: ${taskDescription}

请返回JSON格式:
{
  "estimatedMinutes": 数字,
  "confidence": 0.0到1.0之间的数字,
  "reasoning": "你的估计理由"
}

考虑因素：
- 任务的复杂度
- 所需的专业技能
- 需要的协调或审批流程
- 可能的学习曲线`;
};

/** Priority suggestion prompt. */
export const PRIORITY_SUGGESTION_PROMPT = (
  tasks: Array<{ title: string; description: string }>,
): string => {
  const taskList = tasks.map((t, i) => `${i + 1}. **${t.title}**: ${t.description}`).join('\n');

  return `我有以下任务列表，请帮我按优先级排序：

${taskList}

请返回JSON格式:
{
  "priorities": [
    {
      "title": "任务标题",
      "priority": 1.0到10.0之间的优先级得分,
      "reasoning": "排序理由"
    }
  ],
  "overallStrategy": "整体建议"
}

优先级考虑因素：
- 紧急度（截止日期）
- 重要度（影响范围）
- 依赖关系（是否阻塞其他任务）
- 效益比（投入产出）`;
};
