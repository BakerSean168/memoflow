/**
 * UserReminderPreferences 聚合根实现
 */

import type {
  TimeSlotDTO,
  UserReminderPreferencesClientDTO,
  UserReminderPreferencesServerDTO,
} from '@memoflow/contracts/reminder';
import type { UserReminderPreferencesId } from '@memoflow/contracts/primitives';
import { AggregateRoot } from '@memoflow/utils/domain';
import { generateUUID } from '@memoflow/utils/shared';
import { IdentityId } from '@memoflow/domain-shared';

/**
 * UserReminderPreferences 内部状态接口
 */
export interface UserReminderPreferencesState {
  id: string;
  identityId: IdentityId;
  bestTimeSlots: TimeSlotDTO[];
  worstTimeSlots: TimeSlotDTO[];
  globalReminderEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * UserReminderPreferences 聚合根
 *
 * DDD 聚合根职责：
 * - 管理用户的提醒偏好设置
 * - 记录最佳/最差提醒时间段
 * - 支持时间段推荐算法
 */
export class UserReminderPreferences extends AggregateRoot<string> {
  // ===== 私有字段 =====
  private _identityId: IdentityId;
  private _bestTimeSlots: TimeSlotDTO[];
  private _worstTimeSlots: TimeSlotDTO[];
  private _globalReminderEnabled: boolean;
  private _createdAt: Date;
  private _updatedAt: Date;

  // ===== 构造函数（私有，通过工厂方法创建） =====
  private constructor(state: UserReminderPreferencesState) {
    super(state.id);
    this._identityId = state.identityId;
    this._bestTimeSlots = [...state.bestTimeSlots];
    this._worstTimeSlots = [...state.worstTimeSlots];
    this._globalReminderEnabled = state.globalReminderEnabled;
    this._createdAt = state.createdAt;
    this._updatedAt = state.updatedAt;
  }

  // ===== Getter 属性 =====

  public get identityId(): IdentityId {
    return this._identityId;
  }

  public get bestTimeSlots(): TimeSlotDTO[] {
    return [...this._bestTimeSlots];
  }

  public get worstTimeSlots(): TimeSlotDTO[] {
    return [...this._worstTimeSlots];
  }

  public get globalReminderEnabled(): boolean {
    return this._globalReminderEnabled;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  // ===== 工厂方法 =====

  public static load(state: UserReminderPreferencesState): UserReminderPreferences {
    return new UserReminderPreferences(state);
  }

  /**
   * 创建新的 UserReminderPreferences 聚合根
   */
  public static create(params: {
    identityId: string;
    bestTimeSlots?: TimeSlotDTO[];
    worstTimeSlots?: TimeSlotDTO[];
    globalReminderEnabled?: boolean;
  }): UserReminderPreferences {
    const now = new Date();

    return new UserReminderPreferences({
      id: generateUUID(),
      identityId: params.identityId as IdentityId,
      bestTimeSlots: params.bestTimeSlots ?? [],
      worstTimeSlots: params.worstTimeSlots ?? [],
      globalReminderEnabled: params.globalReminderEnabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // ===== 业务方法 =====

  /**
   * 添加最佳时间段
   */
  public addBestTimeSlot(timeSlot: TimeSlotDTO): void {
    // 验证时间段有效性
    if (timeSlot.hourStart < 0 || timeSlot.hourStart > 23) {
      throw new Error('hourStart must be between 0 and 23');
    }
    if (timeSlot.hourEnd < 0 || timeSlot.hourEnd > 23) {
      throw new Error('hourEnd must be between 0 and 23');
    }
    if (timeSlot.avgResponseRate < 0 || timeSlot.avgResponseRate > 100) {
      throw new Error('avgResponseRate must be between 0 and 100');
    }

    // 检查是否已存在重叠的时间段
    const existingIndex = this._bestTimeSlots.findIndex(
      (slot) => slot.hourStart === timeSlot.hourStart && slot.hourEnd === timeSlot.hourEnd,
    );

    if (existingIndex >= 0) {
      // 更新现有时间段
      this._bestTimeSlots[existingIndex] = timeSlot;
    } else {
      // 添加新时间段
      this._bestTimeSlots.push(timeSlot);
      // 按响应率降序排序
      this._bestTimeSlots.sort((a, b) => b.avgResponseRate - a.avgResponseRate);
    }

    this._updatedAt = new Date(Date.now());
  }

  /**
   * 添加最差时间段
   */
  public addWorstTimeSlot(timeSlot: TimeSlotDTO): void {
    // 验证时间段有效性
    if (timeSlot.hourStart < 0 || timeSlot.hourStart > 23) {
      throw new Error('hourStart must be between 0 and 23');
    }
    if (timeSlot.hourEnd < 0 || timeSlot.hourEnd > 23) {
      throw new Error('hourEnd must be between 0 and 23');
    }
    if (timeSlot.avgResponseRate < 0 || timeSlot.avgResponseRate > 100) {
      throw new Error('avgResponseRate must be between 0 and 100');
    }

    // 检查是否已存在重叠的时间段
    const existingIndex = this._worstTimeSlots.findIndex(
      (slot) => slot.hourStart === timeSlot.hourStart && slot.hourEnd === timeSlot.hourEnd,
    );

    if (existingIndex >= 0) {
      // 更新现有时间段
      this._worstTimeSlots[existingIndex] = timeSlot;
    } else {
      // 添加新时间段
      this._worstTimeSlots.push(timeSlot);
      // 按响应率升序排序
      this._worstTimeSlots.sort((a, b) => a.avgResponseRate - b.avgResponseRate);
    }

    this._updatedAt = new Date(Date.now());
  }

  /**
   * 更新所有时间段
   */
  public updateTimeSlots(best: TimeSlotDTO[], worst: TimeSlotDTO[]): void {
    this._bestTimeSlots = [...best];
    this._worstTimeSlots = [...worst];
    this._updatedAt = new Date(Date.now());
  }

  public toggleGlobalReminderEnabled(enabled: boolean): void {
    this._globalReminderEnabled = enabled;
    this._updatedAt = new Date(Date.now());
  }

  /**
   * 获取响应率最高的时间段
   */
  public getBestTimeSlot(): TimeSlotDTO | null {
    if (this._bestTimeSlots.length === 0) {
      return null;
    }
    return this._bestTimeSlots[0];
  }

  /**
   * 获取响应率最低的时间段
   */
  public getWorstTimeSlot(): TimeSlotDTO | null {
    if (this._worstTimeSlots.length === 0) {
      return null;
    }
    return this._worstTimeSlots[0];
  }

  /**
   * 判断某个小时是否是好时机
   * @param hour 小时 (0-23)
   */
  public isGoodTimeToRemind(hour: number): boolean {
    if (hour < 0 || hour > 23) {
      throw new Error('hour must be between 0 and 23');
    }

    // 检查是否在最佳时间段内
    const inBestSlot = this._bestTimeSlots.some(
      (slot) => hour >= slot.hourStart && hour <= slot.hourEnd,
    );

    // 检查是否在最差时间段内
    const inWorstSlot = this._worstTimeSlots.some(
      (slot) => hour >= slot.hourStart && hour <= slot.hourEnd,
    );

    // 如果在最佳时间段内，返回 true
    if (inBestSlot) return true;

    // 如果在最差时间段内，返回 false
    if (inWorstSlot) return false;

    // 否则返回 true（中性时间段）
    return true;
  }

  // ===== 转换方法 =====

  /**
   * 转换为 Server DTO
   */
  public toServerDTO(): UserReminderPreferencesServerDTO {
    return {
      id: this.id as UserReminderPreferencesId,
      identityId: this._identityId,
      bestTimeSlots: [...this._bestTimeSlots],
      worstTimeSlots: [...this._worstTimeSlots],
      globalReminderEnabled: this._globalReminderEnabled,
      createdAt: this._createdAt.getTime(),
      updatedAt: this._updatedAt.getTime(),
    };
  }

  /**
   * 转换为 Client DTO
   */
  public toClientDTO(): UserReminderPreferencesClientDTO {
    // 生成最佳时间段文本
    const bestTimeSlotsText = this._bestTimeSlots
      .map(
        (slot) =>
          `${String(slot.hourStart).padStart(2, '0')}:00-${String(slot.hourEnd).padStart(2, '0')}:00`,
      )
      .join(', ');

    // 生成最差时间段文本
    const worstTimeSlotsText = this._worstTimeSlots
      .map(
        (slot) =>
          `${String(slot.hourStart).padStart(2, '0')}:00-${String(slot.hourEnd).padStart(2, '0')}:00`,
      )
      .join(', ');

    return {
      id: this.id as UserReminderPreferencesId,
      identityId: this._identityId,
      bestTimeSlots: [...this._bestTimeSlots],
      worstTimeSlots: [...this._worstTimeSlots],
      globalReminderEnabled: this._globalReminderEnabled,
      createdAt: this._createdAt.getTime(),
      updatedAt: this._updatedAt.getTime(),
      bestTimeSlotsText,
      worstTimeSlotsText,
      summaryText: this._globalReminderEnabled ? '提醒总开关已开启' : '提醒总开关已关闭',
    };
  }
}
