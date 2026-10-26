/**
 * Label Contracts —— 过渡入口（仅余 portable 组合）
 *
 * Label 核心契约本体已迁入 @memoflow/label-contracts（P2 / PR #650），
 * 仓内核心消费方已在本 PR 改为直引 @memoflow/label-contracts。
 * 本文件仅保留 portable v3 组合的再导出；该组合将在紧随其后的
 * Label 收尾步迁入 @memoflow/label-contracts，届时删除本入口与
 * contracts 的 ./label 子路径。
 */
export * from './portable-v3';
