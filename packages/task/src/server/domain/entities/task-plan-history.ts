import type { Instant } from '@memoflow/contracts/primitives';
/**
 * TaskPlanHistory 实体实现 (Server)
 * 任务模板历史记录 - 实体
 */

import { Entity } from '@memoflow/utils/domain';
import { generateUUID } from '@memoflow/utils/shared';
import type {
  TaskPlanHistoryServerDTO,
  TaskPlanHistoryClientDTO,
} from '@memoflow/contracts/task';

/**
 * Internal state interface for TaskPlanHistory
 */
export interface TaskPlanHistoryState {
  id: string;
  templateId: string;
  action: string;
  changes: unknown;
  createdAt: Instant;
}

/**
 * TaskPlanHistory 实体
 *
 * DDD 实体特点：
 * - 有唯一标识符（uuid）
 * - 有生命周期
 * - 可变性
 */
export class TaskPlanHistory extends Entity<string> {
  private _templateId: string;
  private _action: string;
  private _changes: unknown;
  private _createdAt: Instant;

  private constructor(state: TaskPlanHistoryState) {
    super(state.id);
    this._templateId = state.templateId;
    this._action = state.action;
    this._changes = state.changes;
    this._createdAt = state.createdAt;
  }

  // Getters


  public get templateId(): string {
    return this._templateId;
  }

  public get action(): string {
    return this._action;
  }

  public get changes(): unknown {
    return this._changes;
  }

  public get createdAt(): Instant {
    return this._createdAt;
  }

  /**
   * DTO 转换
   */
  public toServerDTO(): TaskPlanHistoryServerDTO {
    return {
      id: this.id,
      templateId: this._templateId,
      action: this._action,
      changes: this._changes,
      createdAt: this._createdAt,
    };
  }

  public toClientDTO(): TaskPlanHistoryClientDTO {
    return {
      id: this.id,
      templateId: this._templateId,
      action: this._action,
      changes: this._changes,
      createdAt: this._createdAt,
    };
  }

  /**
   * 🏭 恢复工厂：从状态恢复实体
   */
  public static load(state: TaskPlanHistoryState): TaskPlanHistory {
    return new TaskPlanHistory(state);
  }

  /**
   * 🏭 业务工厂：创建新的历史记录
   */
  public static create(params: {
    templateId: string;
    action: string;
    changes?: unknown;
  }): TaskPlanHistory {
    return new TaskPlanHistory({
      id: generateUUID(),
      templateId: params.templateId,
      action: params.action,
      changes: params.changes ?? null,
      createdAt: Date.now(),
    });
  }
}
