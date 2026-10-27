/**
 * TaskPlan ID Value Object
 * 任务模板 ID 强类型
 *
 * 真身自 @memoflow/shared-primitives 迁入（Issue #630 §2.3）：Task 系 branded ID 归 task-contracts 所有。
 * 运行时工厂（createIdType）与 ID_PREFIXES 表留在 @memoflow/task / shared-primitives。
 */
export type TaskPlanId = string & { readonly __brand: 'TaskPlanId' };
