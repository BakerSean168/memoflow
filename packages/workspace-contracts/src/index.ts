/**
 * Workspace Contracts - 跨域组合契约
 *
 * 本包只承载 Issue #630 §3.2 的封闭清单两棵组装子树：GoalWorkspace* 与 TaskPlanWorkspace*。
 * 叶子契约仍归各业务 contracts 包所有：Goal 叶子见 @memoflow/goal-contracts，
 * Task 叶子见 @memoflow/task-contracts；本包单向依赖它们，业务 -contracts 永不反向依赖本包。
 * Repository 知识引用由 @memoflow/repository-contracts 提供。
 */
export * from './goal-workspace.dto';
export * from './task-workspace.dto';
