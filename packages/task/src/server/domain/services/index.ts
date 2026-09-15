/**
 * Task Domain Services
 * 任务模块领域服务导出
 * 
 * 【规范说明：领域服务（Domain Service）】
 * 领域服务是跨聚合根的业务逻辑，使用场景：
 * - 一次操作涉及多个聚合根时（例：打帕二轮会话涉及多个人的决策）
 * - 业务逻辑不嵒于任何单一聚合根（例：优先管理逻辑可能跨任务和目标）
 * - 无决类状态：整个业务逻辑执行后才保存
 * - 注入仓储：很有提供仓储侟可培议可涓
 * 
 * 【TaskOccurrenceGenerationService】
 * - 任务实例执行：根据任务模板生成具体任务实例
 * - 是弹是粘贴上一个骨架
 */

export { TaskOccurrenceGenerationService } from './task-occurrence-generation-service';

export { TaskPlanOutcomeEvaluator } from './task-plan-outcome-evaluator';
