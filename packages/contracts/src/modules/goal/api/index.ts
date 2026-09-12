/**
 * Goal API - Unified Exports
 *
 * 统一导出所有目标相关的 API 定义
 * 使用方式: import { CreateGoalReq, AddKeyResultReq } from '@contracts/goal/api';
 */

// 从 feature-based DTO files 导出
export * from './goal-crud.dto';
export * from './key-result.dto';
export * from './goal-record.dto';
export * from './goal-review.dto';
export * from './goal-invocation.schemas';
export * from './response-schemas';
export * from './goal-workspace.dto';
