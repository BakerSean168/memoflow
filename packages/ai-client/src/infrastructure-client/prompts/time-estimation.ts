/**
 * 任务时间估算提示词
 * @module @/infrastructure-client/prompts/time-estimation
 */

/**
 * 时间估算系统提示词
 * 指导 AI 进行准确的任务时间估算
 */
export const TIME_ESTIMATION_SYSTEM_PROMPT = `你是一位经验丰富的项目管理专家，擅长准确估算各类任务的耗时。

你的职责是：
1. 分析任务的关键特征（复杂度、任务量、所需资源等）
2. 基于历史数据和最佳实践进行估算
3. 考虑可能的风险和不确定性
4. 提供置信度评分

估算原则：
- 考虑任务的实际难度，不盲目乐观
- 包括研究、理解、实施、测试、调试的时间
- 对于不熟悉的技术领域增加20-30%的缓冲
- 对于高度不确定的任务提供范围估算
- 始终倾向于保守估算

返回格式必须为JSON，包含：
- estimatedMinutes: 预估分钟数（整数）
- confidence: 置信度（0-1之间的数字）
- reasoning: 简要的估算理由
- breakdown: 时间分配明细（可选）
  - analysis: 分析和计划时间
  - implementation: 实施时间
  - testing: 测试和验证时间
  - buffer: 缓冲时间
`;

/**
 * 时间估算用户提示词模板
 * @param taskTitle 任务标题
 * @param taskDescription 任务描述
 * @param complexity 任务复杂度('simple', 'medium', 'complex')
 * @param dependencies 依赖任务信息
 * @param historicalData 历史数据（可选）
 * @returns 格式化的用户提示词
 */
interface TimeEstimationHistoricalData {
  averageMinutes?: number;
  userSpeedFactor?: number;
  estimationAccuracy?: number;
}

export const TIME_ESTIMATION_USER_PROMPT_TEMPLATE = (
  taskTitle: string,
  taskDescription: string,
  complexity?: 'simple' | 'medium' | 'complex',
  dependencies?: string[],
  historicalData?: TimeEstimationHistoricalData,
): string => {
  const complexityInfo = complexity
    ? `任务复杂度：${complexity === 'simple' ? '简单' : complexity === 'medium' ? '中等' : '复杂'}\n`
    : '';

  const dependenciesInfo =
    dependencies && dependencies.length > 0 ? `依赖任务：${dependencies.join('、')}\n` : '';

  const historicalInfo = historicalData
    ? `历史参考数据：
  - 相似任务平均耗时：${historicalData.averageMinutes || '未知'}分钟
  - 用户的完成速度系数：${historicalData.userSpeedFactor || 1}
  - 过去的估算准确度：${historicalData.estimationAccuracy || '未知'}%\n`
    : '';

  return `请估算以下任务的耗时：

任务标题：${taskTitle}

任务描述：
${taskDescription}

${complexityInfo}${dependenciesInfo}${historicalInfo}
请提供详细的时间估算，包括：
1. 总预估分钟数
2. 置信度评分（考虑信息的完整性和任务的清晰度）
3. 时间分配明细（分析、实施、测试等）
4. 主要的时间消耗点
5. 可能的风险因素

返回有效的 JSON 格式。`;
};

/**
 * 批量时间估算提示词
 * @param tasks 任务数组
 * @returns 格式化的批量估算提示词
 */
export const BATCH_TIME_ESTIMATION_PROMPT = (
  tasks: Array<{ title: string; description: string; complexity?: string }>,
): string => {
  const taskList = tasks
    .map(
      (task, index) =>
        `${index + 1}. 【${task.title}】
   描述：${task.description}
   复杂度：${task.complexity || '未指定'}`,
    )
    .join('\n\n');

  return `请为以下${tasks.length}个任务分别估算耗时：

${taskList}

请为每个任务提供：
1. 估算分钟数
2. 置信度（0-1）
3. 简短理由

返回 JSON 数组格式。`;
};

/**
 * 时间估算精准性分析提示词
 * 用于学习用户的真实工作速度
 */
export const TIME_ESTIMATION_ACCURACY_PROMPT = (
  estimatedMinutes: number,
  actualMinutes: number,
  taskTitle: string,
): string => {
  const error = Math.abs(((actualMinutes - estimatedMinutes) / estimatedMinutes) * 100).toFixed(1);
  const direction = actualMinutes > estimatedMinutes ? '低估' : '高估';

  return `分析以下任务的时间估算准确性：

任务：${taskTitle}
估算时间：${estimatedMinutes} 分钟
实际时间：${actualMinutes} 分钟
偏差：${direction}${error}%

请分析：
1. 偏差的可能原因
2. 对于相似任务的后续估算建议
3. 用户是否有特定的工作模式（如经常低估/高估）

返回 JSON 格式的分析结果。`;
};

/**
 * 基于历史数据调整估算的提示词
 */
export const ADJUSTED_TIME_ESTIMATION_PROMPT = (
  taskTitle: string,
  taskDescription: string,
  complexity: string,
  baseEstimate: number,
  userHistoricalData: {
    averageAccuracyError: number; // -30 表示平均高估30%
    completionSpeedFactor: number; // < 1 表示比平均快
    complexityBias: Record<string, number>; // 各复杂度的偏差
  },
): string => {
  const historicalContext = `用户历史数据：
- 平均估算偏差：${userHistoricalData.averageAccuracyError > 0 ? '+' : ''}${userHistoricalData.averageAccuracyError}%
- 完成速度系数：${userHistoricalData.completionSpeedFactor}（1.0为平均水平）
- ${complexity}复杂度任务的偏差：${userHistoricalData.complexityBias[complexity] || 0}%`;

  return `基于以下信息调整时间估算：

任务：${taskTitle}
描述：${taskDescription}
复杂度：${complexity}
基础估算：${baseEstimate} 分钟

${historicalContext}

请根据用户的历史工作模式和速度特点，调整这个任务的时间估算。
考虑因素：
1. 用户的平均估算偏差模式
2. 用户在该复杂度任务上的特定模式
3. 用户的整体工作速度

返回调整后的估算（包括新的分钟数和调整理由）。`;
};
