import type { Instant } from '@memoflow/contracts/primitives';
import type { LabelDto } from '@memoflow/contracts/label';
/**
 * Goal 聚合根实现
 * 实现 GoalServer 接口
 *
 * 【规范说明：聚合根（Aggregate Root）】
 * 聚合根是 DDD 中的核心概念，代表一个业务边界：
 * - 唯一标识：通过 UUID 区分不同的聚合实例
 * - 事务边界：所有对聚合的修改在一个事务内完成
 * - 统一性：聚合保证内部状态的一致性
 * - 生命周期：聚合有创建、修改、删除的完整生命周期
 *
 * 【Goal 职责】
 * 管理目标的完整生命周期：
 * - 目标属性管理（名称、描述、颜色、分析、动机）
 * - 关键结果管理（KR 的创建、修改、删除、排序）
 * - 进度计算（基于 KR 的加权平均）
 * - 回顾管理（定期回顾和反思）
 * - 权重快照（记录权重变更历史）
 * - 提醒配置（提醒触发器管理）
 * - 软删除支持（保留历史记录）
 *
 * 【不变量（Invariants）】
 * 这些条件必须始终保持真：
 * - completedKeyResults <= totalKeyResults
 * - 目标必须至少有一个标识符（id/identityId）
 * - 软删除后不能再修改属性（只能恢复）
 * - 目标进度在 0-100 之间
 */

import { AggregateRoot } from '@memoflow/utils/domain';
import { IdentityId } from '@memoflow/domain-shared';
import { GoalId, KeyResultWeightSnapshotId, KeyResultId } from '../value-objects';
import type { GoalEventMap } from '@memoflow/contracts/goal';
import { GoalStatus, ReminderTriggerType } from '@memoflow/contracts/goal';
import type {
  SnapshotTrigger,
  GoalReminderConfigDTO,
  GoalReviewSystemContext,
} from '@memoflow/contracts/goal';
import type {
  GoalServerDTO,
  GoalReviewServerDTO,
  KeyResultServerDTO,
  ReminderTrigger,
} from '@memoflow/contracts/goal';
import { KeyResult } from '../entities/key-result';
import { GoalReview } from '../entities/goal-review';
import {
  GoalReminderConfig,
  KeyResultWeightSnapshot,
  KeyResultNotFoundInGoalError,
  GoalNameRequiredError,
  GoalInvalidDateRangeError,
  GoalKeyResultNotFoundError,
  GoalReviewNotFoundError,
  GoalDeletedError,
  GoalArchivedError,
  GoalInvalidLifecycleTransitionError,
  GoalNameTooLongError,
  KeyResultWeightInvalidError,
} from '../value-objects';

// ================ 常量定义 ================

/**
 * Goal 内部状态接口
 * 自包含的领域状态定义，不依赖外部 DTO 接口
 */
export interface GoalState {
  id: GoalId;
  identityId: IdentityId;
  name: string;
  summary: string | null;
  status: GoalStatus;
  startDate: Instant | null;
  dueDate: Instant | null;
  completedAt: Instant | null;
  archivedAt: Instant | null;
  sortOrder: number;
  reminderConfig: GoalReminderConfig | null;
  keyResults: KeyResult[];
  goalReviews: GoalReview[];
  weightSnapshots: KeyResultWeightSnapshot[];
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
  deletedAt: Instant | null;
}

/**
 * Goal 聚合根
 */
export class Goal extends AggregateRoot<GoalId> {
  // ================= 1. 内部状态 (Props Pattern) =================
  /**
   * 使用单一 _props 对象存储所有内部状态
   * 注意：非 readonly，因为需要支持 mutation 方法
   */
  private _props: GoalState;
  /** Application/read projection only; labels are not Goal business state. */
  private _labelProjection: LabelDto[] = [];

  // ================= 2. 构造函数（Private） =================
  /**
   * 【规范说明】
   * 构造函数必须为 private，防止外部直接 new Goal(...)
   * 确保所有实例都通过工厂方法创建，保证业务规则验证
   */
  private constructor(params: GoalState) {
    super(params.id);

    this._props = {
      id: params.id,
      identityId: params.identityId,
      name: params.name,
      summary: params.summary ?? null,
      status: params.status,
      startDate: params.startDate ?? null,
      dueDate: params.dueDate ?? null,
      completedAt: params.completedAt ?? null,
      archivedAt: params.archivedAt ?? null,
      sortOrder: params.sortOrder,
      reminderConfig: params.reminderConfig ?? null,
      version: params.version ?? 1,
      createdAt: params.createdAt,
      updatedAt: params.updatedAt,
      deletedAt: params.deletedAt ?? null,
      keyResults: params.keyResults ?? [],
      goalReviews: params.goalReviews ?? [],
      weightSnapshots: params.weightSnapshots ?? [],
    };
  }

  // ================= 3. 公共属性 (Getters) =================
  /**
   * 【规范说明】
   * 通过 public get 暴露状态，但标记为只读
   * 确保外部只能读取，不能直接修改
   * 所有修改必须通过明确的业务方法进行
   */

  get identityId(): IdentityId {
    return this._props.identityId;
  }

  get name(): string {
    return this._props.name;
  }

  get summary(): string | null {
    return this._props.summary;
  }

  get status(): GoalStatus {
    return this._props.status;
  }

  get startDate(): Instant | null {
    return this._props.startDate;
  }

  get dueDate(): Instant | null {
    return this._props.dueDate;
  }

  get completedAt(): Instant | null {
    return this._props.completedAt;
  }

  get archivedAt(): Instant | null {
    return this._props.archivedAt;
  }

  get sortOrder(): number {
    return this._props.sortOrder;
  }

  get reminderConfig(): GoalReminderConfig | null {
    return this._props.reminderConfig;
  }

  get version(): number {
    return this._props.version;
  }

  public advanceVersion(): void {
    this._props.version += 1;
  }

  get createdAt(): Instant {
    return this._props.createdAt;
  }

  get updatedAt(): Instant {
    return this._props.updatedAt;
  }

  get deletedAt(): Instant | null {
    return this._props.deletedAt;
  }

  get keyResults(): KeyResult[] {
    return [...this._props.keyResults];
  }

  get goalReviews(): GoalReview[] {
    return [...this._props.goalReviews];
  }

  get weightSnapshots(): ReadonlyArray<KeyResultWeightSnapshot> {
    return this._props.weightSnapshots;
  }

  get progress(): number {
    return this.calculateProgress();
  }

  get labels(): readonly LabelDto[] {
    return [...this._labelProjection];
  }

  /** Hydrates the shared-label read projection without changing Goal business state. */
  public hydrateLabels(labels: readonly LabelDto[]): void {
    this._labelProjection = labels.map((label) => ({ ...label }));
  }

  // ================= 5. 工厂方法 (Factory Methods) =================

  /**
   * 🏭 业务工厂：创建新的目标
   *
   * 【DDD 设计】
   * 工厂方法负责所有验证，确保创建的目标始终处于有效状态。
   * 这遵循了"Tell, Don't Ask"原则 - 调用者只需告诉 Goal 要做什么，
   * Goal 自己负责验证和保护其不变量。
   *
   * 【本地优先支持】
   * - 支持通过 params.id 传入前端生成的 ID
   * - 如果不提供则自动生成
   *
   * @param params 创建参数
   * @throws {GoalNameRequiredError} 当名称为空时
   * @throws {GoalNameTooLongError} 当名称超过200字符时
   * @throws {GoalInvalidDateRangeError} 当开始日期晚于截止日期时
   */
  public static create(params: {
    id?: GoalId;
    identityId: IdentityId;
    name: string;
    summary: string | null;
    startDate: Instant | null;
    dueDate: Instant | null;
    reminderConfig: GoalReminderConfig | null;
  }): Goal {
    if (!params.identityId) {
      throw new GoalNameRequiredError();
    }
    Goal.validateTitle(params.name);
    Goal.validateDateRange(params.startDate, params.dueDate);

    const now = Date.now();
    const goal = new Goal({
      id: params.id ?? GoalId.generate(),
      identityId: params.identityId,
      name: params.name.trim(),
      summary: params.summary?.trim() || null,
      status: GoalStatus.Planned,
      startDate: params.startDate ?? null,
      dueDate: params.dueDate ?? null,
      completedAt: null,
      archivedAt: null,
      sortOrder: 0,
      reminderConfig: params.reminderConfig ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      keyResults: [],
      goalReviews: [],
      weightSnapshots: [],
    });

    goal.addDomainEvent<GoalEventMap['goal:created']>('goal:created', {
      identityId: params.identityId,
      goal: goal.toServerDTO(true),
    });
    return goal;
  }

  /**
   * 🏭 恢复工厂：从领域状态恢复
   * 用于从持久化层或其他来源重建聚合根
   */
  public static load(state: GoalState): Goal {
    return new Goal(state);
  }

  // ================= 6. 业务行为 (Business Methods) =================

  /**
   * ✅ 更新基本信息
   *
   * 【DDD 设计】
   * 聚合根自己保护自己的不变量：
   * - 不允许修改已删除的目标
   * - 不允许修改已归档的目标
   * - 验证名称有效性
   *
   * @throws {GoalDeletedError} 当目标已删除时
   * @throws {GoalArchivedError} 当目标已归档时
   * @throws {GoalNameRequiredError} 当名称为空时
   * @throws {GoalNameTooLongError} 当名称超过200字符时
   */
  public updateBasicInfo(params: { name?: string; summary?: string | null }): void {
    this.ensureModifiable();
    let hasChanges = false;
    if (params.name !== undefined && params.name !== this._props.name) {
      Goal.validateTitle(params.name);
      this._props.name = params.name.trim();
      hasChanges = true;
    }
    if (params.summary !== undefined) {
      const summary = params.summary?.trim() || null;
      Goal.validateSummary(summary);
      if (summary !== this._props.summary) {
        this._props.summary = summary;
        hasChanges = true;
      }
    }
    if (hasChanges) {
      this._props.updatedAt = Date.now();
      this.emitGoalUpdated(Object.keys(params));
    }
  }

  public updateTimeRange(params: { startDate?: Instant | null; dueDate?: Instant | null }): void {
    const nextStartDate = params.startDate !== undefined ? params.startDate : this._props.startDate;
    const nextDueDate = params.dueDate !== undefined ? params.dueDate : this._props.dueDate;
    if (nextStartDate === this._props.startDate && nextDueDate === this._props.dueDate) return;
    Goal.validateDateRange(nextStartDate, nextDueDate);
    if (params.startDate !== undefined) this._props.startDate = params.startDate;
    if (params.dueDate !== undefined) this._props.dueDate = params.dueDate;
    this._props.updatedAt = Date.now();
    const changes = Object.keys(params);
    this.emitGoalUpdated(changes);
    this.addDomainEvent<GoalEventMap['goal:schedule-time-changed']>('goal:schedule-time-changed', {
      identityId: this._props.identityId,
      goal: this.toServerDTO(true),
      changes,
    });
  }

  /** Apply one explicit lifecycle transition from ADR-067. */
  private transitionTo(newStatus: GoalStatus): boolean {
    this.ensureModifiable();
    if (newStatus === this._props.status) return false;
    const previousStatus = this._props.status;
    const allowed: Record<GoalStatus, readonly GoalStatus[]> = {
      [GoalStatus.Planned]: [GoalStatus.InProgress, GoalStatus.Abandoned],
      [GoalStatus.InProgress]: [GoalStatus.Planned, GoalStatus.Completed, GoalStatus.Abandoned],
      [GoalStatus.Completed]: [GoalStatus.InProgress],
      [GoalStatus.Abandoned]: [GoalStatus.Planned, GoalStatus.InProgress],
    };
    if (!allowed[previousStatus].includes(newStatus)) {
      throw new GoalInvalidLifecycleTransitionError(previousStatus, newStatus);
    }

    const now = Date.now();
    this._props.status = newStatus;
    if (newStatus === GoalStatus.Completed) this._props.completedAt = now;
    else if (previousStatus === GoalStatus.Completed) this._props.completedAt = null;
    this._props.updatedAt = now;
    this.addDomainEvent<GoalEventMap['goal:status-changed']>('goal:status-changed', {
      identityId: this._props.identityId,
      goal: this.toServerDTO(true),
      previousStatus,
      newStatus,
    });
    return true;
  }

  /** Move a Planned/Abandoned Goal back to the planning state. */
  public plan(): void {
    this.transitionTo(GoalStatus.Planned);
  }

  /** Begin or reopen active pursuit of a Goal. */
  public activate(): void {
    this.transitionTo(GoalStatus.InProgress);
  }

  public abandon(): void {
    this.transitionTo(GoalStatus.Abandoned);
  }

  public markAsCompleted(): void {
    if (!this.transitionTo(GoalStatus.Completed)) return;
    this.addDomainEvent<GoalEventMap['goal:completed']>('goal:completed', {
      identityId: this._props.identityId,
      goal: this.toServerDTO(true),
      finalProgress: this.calculateProgress(),
      completedAt: this._props.completedAt!,
    });
  }

  public archive(): void {
    if (this._props.archivedAt) return;
    this.ensureNotDeleted();
    const now = Date.now();
    this._props.archivedAt = now;
    this._props.updatedAt = now;
    this.emitGoalArchived(now);
  }

  public softDelete(): void {
    if (this._props.deletedAt) return;
    const now = Date.now();
    this._props.deletedAt = now;
    this._props.updatedAt = now;
    this.addDomainEvent<GoalEventMap['goal:deleted']>('goal:deleted', {
      identityId: this._props.identityId,
      goalId: this.id,
      goal: this.toServerDTO(true),
      isSoftDelete: true,
      deletedAt: now,
    });
  }

  /**
   * ✅ 检查是否可以永久删除
   *
   * 只有已归档的目标才能被永久删除。
   */
  public canBePermanentlyDeleted(): boolean {
    return this._props.archivedAt !== null;
  }

  /**
   * ✅ 更新排序
   */
  public updateSortOrder(sortOrder: number): void {
    this._props.sortOrder = sortOrder;
    this._props.updatedAt = Date.now();
  }

  /**
   * ✅ 更新提醒配置
   */
  public updateReminderConfig(config: GoalReminderConfigDTO | null): void {
    this._props.reminderConfig = config ? GoalReminderConfig.fromDTO(config) : null;
    this._props.updatedAt = Date.now();
    this.addDomainEvent<GoalEventMap['goal:reminder-config-changed']>(
      'goal:reminder-config-changed',
      {
        identityId: this._props.identityId,
        goal: this.toServerDTO(true),
        changes: ['reminderConfig'],
      },
    );
  }

  /**
   * ✅ 启用提醒
   */
  public enableReminder(): void {
    if (this._props.reminderConfig) {
      this._props.reminderConfig = this._props.reminderConfig.setEnabled(true);
      this._props.updatedAt = Date.now();
      this.addDomainEvent<GoalEventMap['goal:reminder-config-changed']>(
        'goal:reminder-config-changed',
        {
          identityId: this._props.identityId,
          goal: this.toServerDTO(true),
          changes: ['reminderConfig', 'enabled'],
        },
      );
    }
  }

  /**
   * ✅ 禁用提醒
   */
  public disableReminder(): void {
    if (this._props.reminderConfig) {
      this._props.reminderConfig = this._props.reminderConfig.setEnabled(false);
      this._props.updatedAt = Date.now();
      this.addDomainEvent<GoalEventMap['goal:reminder-config-changed']>(
        'goal:reminder-config-changed',
        {
          identityId: this._props.identityId,
          goal: this.toServerDTO(true),
          changes: ['reminderConfig', 'enabled'],
        },
      );
    }
  }

  /**
   * ✅ 添加提醒触发器
   */
  public addReminderTrigger(trigger: ReminderTrigger): void {
    if (!this._props.reminderConfig) {
      throw new Error('Reminder config not initialized');
    }
    this._props.reminderConfig = this._props.reminderConfig.addTrigger(trigger);
    this._props.updatedAt = Date.now();
    this.addDomainEvent<GoalEventMap['goal:reminder-config-changed']>(
      'goal:reminder-config-changed',
      {
        identityId: this._props.identityId,
        goal: this.toServerDTO(true),
        changes: ['reminderConfig', 'triggers'],
      },
    );
  }

  /**
   * ✅ 移除提醒触发器
   */
  public removeReminderTrigger(type: ReminderTriggerType, value: number): void {
    if (!this._props.reminderConfig) {
      throw new Error('Reminder config not initialized');
    }
    this._props.reminderConfig = this._props.reminderConfig.removeTrigger(type, value);
    this._props.updatedAt = Date.now();
    this.addDomainEvent<GoalEventMap['goal:reminder-config-changed']>(
      'goal:reminder-config-changed',
      {
        identityId: this._props.identityId,
        goal: this.toServerDTO(true),
        changes: ['reminderConfig', 'triggers'],
      },
    );
  }

  // ================= 4. 关键结果管理 (KeyResult Management) =================

  /**
   * 🏭 创建并添加关键结果
   *
   * 【DDD 设计】
   * 这是一个便捷方法，结合了创建和添加操作。
   * 聚合根自己验证权重范围和总和约束。
   *
   * @throws {GoalDeletedError} 当目标已删除时
   * @throws {GoalArchivedError} 当目标已归档时
   * @throws {KeyResultWeightInvalidError} 当权重不在1-5之间时
   */
  public createAndAddKeyResult(params: {
    id?: KeyResultId;
    title: string;
    description?: string | null;
    aggregationMethod?: KeyResultServerDTO['progress']['aggregationMethod'];
    startingValue?: number;
    currentValue?: number;
    targetValue: number;
    progressBaselineValue?: number | null;
    unit?: string | null;
    weight?: number;
  }): KeyResult {
    this.ensureModifiable();
    const weight = params.weight ?? 3;
    Goal.validateKeyResultWeight(weight);
    const currentValue = params.currentValue ?? params.startingValue ?? 0;
    const startingValue = params.startingValue ?? currentValue;
    const keyResult = KeyResult.create({
      id: params.id,
      title: params.title,
      description: params.description ?? undefined,
      progress: {
        startingValue,
        currentValue,
        targetValue: params.targetValue,
        progressBaselineValue: params.progressBaselineValue ?? null,
        aggregationMethod: params.aggregationMethod ?? 'Sum',
        unit: params.unit?.trim() || null,
      },
      weight,
      sortOrder: this._props.keyResults.length,
    });

    this._props.keyResults.push(keyResult);
    this._props.updatedAt = Date.now();
    this.addDomainEvent<GoalEventMap['goal:key-result-added']>('goal:key-result-added', {
      identityId: this._props.identityId,
      goal: this.toServerDTO(true),
      keyResult: keyResult.toServerDTO(),
    });
    return keyResult;
  }

  /**
   * ✅ 更新关键结果属性（标题、描述等）
   * @throws {GoalDeletedError} 当目标已删除时
   * @throws {GoalKeyResultNotFoundError} 当关键结果不存在时
   */
  public updateKeyResult(
    keyResultId: string,
    updates: {
      title?: string;
      description?: string | null;
      weight?: number;
      startingValue?: number;
      currentValue?: number;
      targetValue?: number;
      progressBaselineValue?: number | null;
      unit?: string | null;
      aggregationMethod?: KeyResultServerDTO['progress']['aggregationMethod'];
    },
  ): void {
    this.ensureModifiable();
    const keyResult = this._props.keyResults.find((kr) => kr.id === keyResultId);
    if (!keyResult) throw new GoalKeyResultNotFoundError(keyResultId);

    const previousValue =
      updates.currentValue === undefined ? null : keyResult.progress.currentValue;
    const changeKeys = Object.keys(updates);
    if (updates.title !== undefined) keyResult.updateTitle(updates.title);
    if (updates.description !== undefined) keyResult.updateDescription(updates.description || '');
    if (updates.weight !== undefined) {
      Goal.validateKeyResultWeight(updates.weight);
      keyResult.updateWeight(updates.weight);
    }
    const measurementPatch = {
      ...(updates.startingValue !== undefined ? { startingValue: updates.startingValue } : {}),
      ...(updates.currentValue !== undefined ? { currentValue: updates.currentValue } : {}),
      ...(updates.targetValue !== undefined ? { targetValue: updates.targetValue } : {}),
      ...(updates.progressBaselineValue !== undefined
        ? { progressBaselineValue: updates.progressBaselineValue }
        : {}),
      ...(updates.aggregationMethod !== undefined
        ? { aggregationMethod: updates.aggregationMethod }
        : {}),
    };
    if (Object.keys(measurementPatch).length > 0) keyResult.updateMeasurement(measurementPatch);
    if (updates.unit !== undefined) keyResult.updateUnit(updates.unit);

    this._props.updatedAt = Date.now();
    this.addDomainEvent<GoalEventMap['goal:key-result-updated']>('goal:key-result-updated', {
      identityId: this._props.identityId,
      goal: this.toServerDTO(true),
      keyResult: keyResult.toServerDTO(),
      changes: changeKeys,
      previousValue,
      newValue: updates.currentValue ?? null,
      goalProgress: this.calculateProgress(),
    });
  }

  /**
   * ✅ 重新排序关键结果
   */
  public reorderKeyResults(keyResultIds: string[]): void {
    const newOrder: KeyResult[] = [];
    for (let i = 0; i < keyResultIds.length; i++) {
      const kr = this._props.keyResults.find((k) => k.id === keyResultIds[i]);
      if (kr) {
        kr.updateSortOrder(i);
        newOrder.push(kr);
      }
    }
    // 添加未在列表中的关键结果
    for (const kr of this._props.keyResults) {
      if (!newOrder.includes(kr)) {
        newOrder.push(kr);
      }
    }
    this._props.keyResults = newOrder;
    this._props.updatedAt = Date.now();
  }

  /**
   * 📊 通过 ID 获取关键结果
   */
  public getKeyResult(id: string): KeyResult | null {
    return this._props.keyResults.find((kr) => kr.id === id) || null;
  }

  /**
   * 📊 获取所有关键结果
   */
  public getAllKeyResults(): KeyResult[] {
    return [...this._props.keyResults];
  }

  /**
   * ✅ 更新关键结果进度
   * @throws {GoalDeletedError} 当目标已删除时
   * @throws {GoalKeyResultNotFoundError} 当关键结果不存在时
   */
  public updateKeyResultProgress(
    keyResultId: string,
    newValue: number,
    _note?: string,
  ): KeyResultServerDTO {
    // Guard: 确保未删除
    this.ensureNotDeleted();

    const keyResult = this._props.keyResults.find((kr) => kr.id === keyResultId);
    if (!keyResult) {
      throw new GoalKeyResultNotFoundError(keyResultId);
    }

    const previousValue = keyResult.progress.currentValue;
    keyResult.recalculateProgress(newValue);
    this._props.updatedAt = Date.now();

    this.addDomainEvent<GoalEventMap['goal:key-result-updated']>('goal:key-result-updated', {
      identityId: this._props.identityId,
      goal: this.toServerDTO(true),
      keyResult: keyResult.toServerDTO(),
      changes: ['currentValue', 'progress'],
      previousValue,
      newValue,
      goalProgress: this.calculateProgress(),
    });

    return keyResult.toServerDTO();
  }

  /**
   * ✅ 删除关键结果
   * @throws {GoalDeletedError} 当目标已删除时
   */
  public removeKeyResult(keyResultId: KeyResultId | string): KeyResult | null {
    this.ensureModifiable();

    const index = this._props.keyResults.findIndex((kr) => kr.id === keyResultId);
    if (index !== -1) {
      const removed = this._props.keyResults.splice(index, 1)[0];
      this._props.updatedAt = Date.now();

      this.addDomainEvent<GoalEventMap['goal:key-result-deleted']>('goal:key-result-deleted', {
        identityId: this._props.identityId,
        goal: this.toServerDTO(true),
        keyResultId: keyResultId as KeyResultId,
        keyResult: removed.toServerDTO(),
      });

      return removed;
    }
    return null;
  }

  /**
   * 📊 计算总进度（基于所有关键结果的加权平均）
   *
   * 公式：Progress = Σ(KR.progress × KR.weight) / Σ(KR.weight)
   *
   * @returns 目标进度百分比（0-100）
   */
  public calculateProgress(): number {
    if (this._props.keyResults.length === 0) return 0;

    // 计算总权重
    const totalWeight = this._props.keyResults.reduce((sum, kr) => sum + kr.weight, 0);

    // 如果总权重为 0，使用简单平均
    if (totalWeight === 0) {
      const totalPercentage = this._props.keyResults.reduce(
        (sum, kr) => sum + kr.calculatePercentage(),
        0,
      );
      return Math.round((totalPercentage / this._props.keyResults.length) * 100) / 100;
    }

    // 加权平均计算
    const weightedSum = this._props.keyResults.reduce(
      (sum, kr) => sum + kr.calculatePercentage() * kr.weight,
      0,
    );

    const progress = weightedSum / totalWeight;

    // 四舍五入到小数点后 2 位
    return Math.round(progress * 100) / 100;
  }

  /**
   * 📊 检查是否所有关键结果都已完成
   */
  public areAllKeyResultsCompleted(): boolean {
    if (this._props.keyResults.length === 0) return false;
    return this._props.keyResults.every((kr) => kr.isCompleted());
  }

  // ================= 5. 权重快照管理 (Weight Snapshots) =================

  /**
   * ✅ 记录 KR 权重变更快照
   */
  public recordWeightSnapshot(
    krId: string,
    oldWeight: number,
    newWeight: number,
    trigger: SnapshotTrigger,
    operatorId: string,
    reason?: string,
  ): void {
    // 验证 KR 存在
    const kr = this._props.keyResults.find((k) => k.id === krId);
    if (!kr) {
      throw new KeyResultNotFoundInGoalError(krId, this.id);
    }

    const now = Date.now();
    // 创建快照
    const snapshot = KeyResultWeightSnapshot.create({
      id: KeyResultWeightSnapshotId.of(
        KeyResultWeightSnapshotId.generate(),
      ) as unknown as KeyResultWeightSnapshotId,
      goalId: this.id as unknown as GoalId,
      keyResultId: krId as unknown as KeyResultId,
      identityId: this.identityId as unknown as IdentityId,
      oldWeight,
      newWeight,
      weightDelta: newWeight - oldWeight,
      snapshotTime: now,
      trigger,
      reason: reason ?? null,
      operatorId: operatorId as unknown as IdentityId,
      createdAt: now,
    });

    this._props.weightSnapshots.push(snapshot);
    this._props.updatedAt = Date.now();
  }

  /**
   * 📊 获取所有权重快照
   */
  public getAllWeightSnapshots(): ReadonlyArray<KeyResultWeightSnapshot> {
    return this._props.weightSnapshots;
  }

  /**
   * 📊 获取特定 KR 的权重快照
   */
  public getWeightSnapshotsByKeyResult(krId: string): ReadonlyArray<KeyResultWeightSnapshot> {
    return this._props.weightSnapshots.filter((snapshot) => snapshot.keyResultId === krId);
  }

  // ================= 6. 回顾管理 (Review Management) =================

  /** Creates a review from server-generated system facts plus user reflection. */
  public createAndAddReview(params: {
    reflection: string;
    challenges?: string | null;
    adjustments?: string | null;
    systemContext: GoalReviewSystemContext;
  }): GoalReview {
    this.ensureNotDeleted();
    const review = GoalReview.create({
      goalId: this.id,
      reflection: params.reflection,
      challenges: params.challenges,
      adjustments: params.adjustments,
      systemContext: params.systemContext,
      reviewedAt: params.systemContext.windowEndAt,
    });
    this._props.goalReviews.push(review);
    this._props.updatedAt = Date.now();
    this.addDomainEvent<GoalEventMap['goal:review-added']>('goal:review-added', {
      identityId: this._props.identityId,
      goal: this.toServerDTO(true),
      review: review.toServerDTO() as GoalReviewServerDTO,
    });
    return review;
  }

  /**
   * 📊 获取最新的回顾记录
   */
  public getLatestReview(): GoalReview | null {
    if (this._props.goalReviews.length === 0) return null;
    return this._props.goalReviews[this._props.goalReviews.length - 1];
  }

  /** Updates only user-authored reflection; the system snapshot is immutable. */
  public updateReview(
    reviewId: string,
    params: {
      reflection?: string;
      challenges?: string | null;
      adjustments?: string | null;
    },
  ): void {
    this.ensureNotDeleted();
    const review = this._props.goalReviews.find((item) => item.id === reviewId);
    if (!review) throw new GoalReviewNotFoundError(reviewId);
    if (params.reflection !== undefined) review.updateReflection(params.reflection);
    if (params.challenges !== undefined) review.updateChallenges(params.challenges);
    if (params.adjustments !== undefined) review.updateAdjustments(params.adjustments);
    this._props.updatedAt = Date.now();
  }

  /**
   * ✅ 删除回顾
   * @throws {GoalDeletedError} 当目标已删除时
   */
  public removeReview(reviewId: string): GoalReview | null {
    this.ensureNotDeleted();

    const index = this._props.goalReviews.findIndex((r) => r.id === reviewId);
    if (index !== -1) {
      const removed = this._props.goalReviews.splice(index, 1)[0];
      this._props.updatedAt = Date.now();
      return removed;
    }
    return null;
  }

  // ================= 7. 业务规则检查 (Business Rules) =================

  private ensureNotDeleted(): void {
    if (this._props.deletedAt !== null) {
      throw new GoalDeletedError();
    }
  }

  // ================= 8. 序列化 (Serialization) =================

  /**
   * 转换为 Server DTO
   */
  public toServerDTO(includeChildren: boolean = false): GoalServerDTO {
    return {
      id: this.id,
      identityId: this._props.identityId,
      name: this._props.name,
      summary: this._props.summary,
      status: this._props.status,
      startDate: this._props.startDate,
      dueDate: this._props.dueDate,
      completedAt: this._props.completedAt,
      archivedAt: this._props.archivedAt,
      sortOrder: this._props.sortOrder,
      reminderConfig: this._props.reminderConfig?.toDTO() ?? null,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
      deletedAt: this._props.deletedAt,
      keyResults:
        includeChildren && this._props.keyResults.length > 0
          ? this._props.keyResults.map((kr) => kr.toServerDTO())
          : null,
      weightSnapshots:
        includeChildren && this._props.weightSnapshots.length > 0
          ? this._props.weightSnapshots.map((ws) => ws.toDTO())
          : null,
      goalReviews:
        includeChildren && this._props.goalReviews.length > 0
          ? this._props.goalReviews.map((r) => r.toServerDTO())
          : null,
      version: this._props.version,
    };
  }

  /**
   * 转换为 Client DTO
   */
  public toClientDTO(
    includeChildren: true,
  ): import('@memoflow/contracts/goal').GoalAggregateReadModel;
  public toClientDTO(includeChildren?: false): import('@memoflow/contracts/goal').GoalClientDTO;
  public toClientDTO(includeChildren: boolean): import('@memoflow/contracts/goal').GoalClientDTO;
  public toClientDTO(
    includeChildren: boolean = false,
  ): import('@memoflow/contracts/goal').GoalClientDTO {
    const totalKeyResults = this._props.keyResults.length;
    const completedKeyResults = this._props.keyResults.filter((kr) => kr.isCompleted()).length;

    return {
      id: this.id,
      identityId: this._props.identityId,
      name: this._props.name,
      summary: this._props.summary,
      status: this._props.status,
      startDate: this._props.startDate ?? null,
      dueDate: this._props.dueDate ?? null,
      completedAt: this._props.completedAt ?? null,
      archivedAt: this._props.archivedAt ?? null,
      sortOrder: this._props.sortOrder,
      reminderConfig: this._props.reminderConfig?.toDTO() ?? null,
      labels: this._labelProjection.map((label) => ({ ...label })),
      version: this._props.version,
      createdAt: this._props.createdAt,
      updatedAt: this._props.updatedAt,
      deletedAt: this._props.deletedAt ?? null,
      keyResults: includeChildren ? this._props.keyResults.map((kr) => kr.toClientDTO()) : null,
      reviews: includeChildren ? this._props.goalReviews.map((r) => r.toClientDTO()) : null,
      totalKeyResults,
      completedKeyResults,
      overallProgress: this.calculateProgress(),
    };
  }

  // ================= 9. Guard Clauses (守卫方法) =================

  /**
   * 确保目标未被归档
   * @throws {GoalArchivedError} 当目标已被归档时
   */
  private ensureNotArchived(): void {
    if (this._props.archivedAt !== null) {
      throw new GoalArchivedError(this.id);
    }
  }

  /**
   * 确保目标可以被修改（未归档）
   * @throws {GoalArchivedError} 当目标已被归档时
   */
  private ensureModifiable(): void {
    this.ensureNotDeleted();
    this.ensureNotArchived();
  }

  // ================= 10. 静态验证方法 (Static Validators) =================

  /**
   * 验证目标标题
   * @throws {GoalNameRequiredError} 当标题为空时
   * @throws {GoalNameTooLongError} 当标题超过200字符时
   */
  public static validateTitle(title: string): void {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      throw new GoalNameRequiredError();
    }
    if (trimmed.length > 200) {
      throw new GoalNameTooLongError(200);
    }
  }

  /** Validate the short Goal identity summary. */
  public static validateSummary(summary: string | null): void {
    if (summary !== null && summary.length > 500) {
      throw new Error('Goal summary must not exceed 500 characters');
    }
  }

  /**
   * 验证日期范围
   * @throws {GoalInvalidDateRangeError} 当开始日期晚于截止日期时
   */
  public static validateDateRange(startDate?: Instant | null, dueDate?: Instant | null): void {
    if (startDate && dueDate && Number(startDate) > Number(dueDate)) {
      throw new GoalInvalidDateRangeError(startDate, dueDate);
    }
  }

  /**
   * 验证关键结果权重
   * @throws {KeyResultWeightInvalidError} 当权重不在1-5之间时
   */
  public static validateKeyResultWeight(weight: number): void {
    if (!Number.isInteger(weight) || weight < 1 || weight > 5) {
      throw new KeyResultWeightInvalidError(weight);
    }
  }

  // ================= 11. 辅助方法 (Helpers) =================

  private emitGoalUpdated(changes: string[]): void {
    this.addDomainEvent<GoalEventMap['goal:updated']>('goal:updated', {
      identityId: this._props.identityId,
      goal: this.toServerDTO(true),
      changes,
    });
  }

  private emitGoalArchived(archivedAt: number): void {
    this.addDomainEvent<GoalEventMap['goal:archived']>('goal:archived', {
      identityId: this._props.identityId,
      goal: this.toServerDTO(true),
      archivedAt,
    });
  }
}
