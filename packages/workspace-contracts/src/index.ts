/**
 * Workspace Contracts - 跨域组合契约
 *
 * 本包只承载 Goal Workspace 组装子树（Task/Goal 只读组装投影）。
 * 叶子契约仍归各业务 contracts 包所有：Goal 叶子见 @memoflow/goal-contracts；
 * Task/Repository 投影暂时经 @memoflow/contracts 对应子路径引用，
 * 待各域拆分时改指（清单见 PR 描述）。
 */
export * from './goal-workspace.dto';
