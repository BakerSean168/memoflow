/**
 * AI Domain Services
 * AI 服务统一导出 - 纯领域服务
 *
 * 【规范说明：领域服务（Domain Service）】
 * 领域服务是跨聚合根的业务逻辑，使用场景：
 * - 一次操作涉及多个聚合根时
 * - 业务逻辑不属于任何单一聚合根
 * - 无状态：不持有任何实例状态
 *
 * 【AIGenerationValidationService】
 * - AI 输出验证：仅保留 Summary / Knowledge Series 的领域约束；Goal/Task 结构由 canonical workflow Zod contracts 验证
 * - 纯领域验证，不涉及基础设施
 *
 * 【QuotaEnforcementService】
 * - 额度管理：检查 Token 额度、处理超额
 */

export { AIGenerationValidationService } from './ai-generation-validation-service';
