/**
 * Notification 浠撳偍鎺ュ彛
 *
 * DDD 浠撳偍妯″紡锛?
 * - 鍙畾涔夋帴鍙ｏ紝涓嶅疄鐜?
 * - 鐢卞熀纭€璁炬柦灞傚疄鐜?
 * - 浣跨敤渚濊禆娉ㄥ叆
 * - 闅愯棌鏁版嵁璁块棶缁嗚妭
 */

import type { Notification } from '../aggregates/notification';
import { NotificationCategory } from '@memoflow/contracts/notification';
import type { NotificationChannelType } from '@memoflow/contracts/notification';
import type { NotificationOutboxDispatchInput } from '@memoflow/contracts/reliable-messaging';
import type { NotificationDeliveryDecision } from '../services/notification-policy';

export interface NotificationOutboxDispatchPlan extends NotificationOutboxDispatchInput {
  /** Existing durable worker will hold retryable rows until this instant. */
  deferUntil?: Date | null;
}

export interface NotificationDeliveryUsage {
  hourCount: number;
  dayCount: number;
}

/**
 * INotificationRepository 浠撳偍鎺ュ彛
 *
 * 鑱岃矗锛?
 * - 瀹氫箟鎸佷箙鍖栨搷浣滅殑濂戠害
 * - 鑱氬悎鏍规槸鎿嶄綔鐨勫熀鏈崟浣?
 * - 绾ц仈淇濆瓨/鍔犺浇瀛愬疄ﻠ擄紙channels, history锛?
 */
export interface INotificationRepository {
  /**
   * 保存聚合根（创建或更新）以及可选的 Outbox 投递意图（同一事务）
   */
  save(
    notification: Notification,
    outboxDispatches?: NotificationOutboxDispatchPlan[],
    deliveryDecisions?: readonly NotificationDeliveryDecision[],
  ): Promise<void>;

  /**
   * 鎵归噺淇濆瓨閫氱煡
   */
  saveMany(notifications: Notification[]): Promise<void>;

  /**
   * Counts already planned delivery channels for the same workflow surrogate
   * (current NotificationCategory) and channel over rolling 1h / 24h windows.
   */
  getDeliveryUsage(
    identityId: string,
    workflowKey: string,
    channel: NotificationChannelType,
    now: Date,
  ): Promise<NotificationDeliveryUsage>;

  /**
   * Find notification by id + identity (ownership fence).
   * Returns null when missing or not owned by identityId.
   */
  /**
   * R3e：渠道 worker 用——按渠道状态查询（返回带渠道的聚合，渠道经 status 过滤）。
   */
  findChannelsByStatus(status: string, limit?: number): Promise<Notification[]>;

  findByIdForIdentity(
    identityId: string,
    id: string,
    options?: { includeChildren?: boolean },
  ): Promise<Notification | null>;

  /** Fact-level idempotency fence scoped to identity. */
  findByIdempotencyKey(identityId: string, idempotencyKey: string): Promise<Notification | null>;

  /**
   * 閫氳繃璐︽埛 UUID 鏌ユ壘鎵€鏈夐€氱煡
   *
   * @param identityId 璐︽埛 UUID
   * @param options.includeChildren 鏄惁鍔犺浇瀛愬疄浣?
   * @param options.includeRead 鏄惁鍖呭惈宸茶閫氱煡锛堥粯璁?true锛?
   * @param options.includeDeleted 鏄惁鍖呭惈宸插垹闄ら€氱煡锛堥粯璁?false锛?
   * @param options.limit 闄愬埗鏁伴噺
   * @param options.offset 鍋忕Щ閲?
   * @returns 閫氱煡鍒楄〃
   */
  findByIdentityId(
    identityId: string,
    options?: {
      includeChildren?: boolean;
      includeRead?: boolean;
      includeDeleted?: boolean;
      archiveState?: 'active' | 'archived' | 'all';
      limit?: number;
      offset?: number;
    },
  ): Promise<Notification[]>;

  /**
   * 閫氳繃鍒嗙被鏌ユ壘閫氱煡
   *
   * @param identityId 璐︽埛 UUID
   * @param category 閫氱煡鍒嗙被
   * @param options.limit 闄愬埗鏁伴噺
   * @param options.offset 鍋忕Щ閲?
   */
  findByCategory(
    identityId: string,
    category: NotificationCategory,
    options?: { archiveState?: 'active' | 'archived' | 'all'; limit?: number; offset?: number },
  ): Promise<Notification[]>;

  /**
   * 鏌ユ壘鏈閫氱煡
   *
   * @param identityId 璐︽埛 UUID
   * @param options.limit 闄愬埗鏁伴噺
   */
  findUnread(identityId: string, options?: { archiveState?: 'active' | 'archived' | 'all'; limit?: number }): Promise<Notification[]>;

  /**
   * 鏌ユ壘鐩稿叧瀹炰綋鐨勯€氱煡
   *
   * @param relatedEntityType 鐩稿叧瀹炰綋绫诲瀷
   * @param relatedEntityId 鐩稿叧瀹炰綋 UUID
   */
  findByRelatedEntity(
    identityId: string,
    relatedEntityType: string,
    relatedEntityId: string,
    options?: { archiveState?: 'active' | 'archived' | 'all' },
  ): Promise<Notification[]>;

  /**
   * 鍒犻櫎鑱氬悎鏍?
   *
   * 娉ㄦ剰锛?
   * - 杩欐槸浜嬪姟鎿嶄綔
   * - 绾ц仈鍒犻櫎鎵€鏈夊瓙瀹炰綋
   *
   * @param id 閫氱煡 UUID
   */
  delete(identityId: string, id: string): Promise<void>;

  /**
   * 鎵归噺鍒犻櫎閫氱煡
   */
  deleteMany(identityId: string, ids: string[]): Promise<void>;

  /**
   * 杞垹闄ら€氱煡锛堟爣璁颁负宸插垹闄わ級
   */
  softDelete(identityId: string, id: string): Promise<void>;
  archive(identityId: string, id: string, archivedAt: Date): Promise<void>;
  restore(identityId: string, id: string): Promise<void>;

  /**
   * 妫€鏌ラ€氱煡鏄惁瀛樺湪
   *
   * @param id 閫氱煡 UUID
   */
  exists(identityId: string, id: string): Promise<boolean>;

  /**
   * 缁熻鏈閫氱煡鏁伴噺
   *
   * @param identityId 璐︽埛 UUID
   */
  countUnread(identityId: string): Promise<number>;

  /**
   * 缁熻鍚勫垎绫婚€氱煡鏁伴噺
   *
   * @param identityId 璐︽埛 UUID
   */
  countByCategory(identityId: string): Promise<Record<NotificationCategory, number>>;

  /**
   * 鎵归噺鏍囪涓哄凡璇?
   *
   * @param ids 閫氱煡 UUID 鍒楄〃
   */
  markManyAsRead(identityId: string, ids: string[]): Promise<void>;

  /**
   * 鏍囪鎵€鏈変负宸茶
   *
   * @param identityId 璐︽埛 UUID
   */
  markAllAsRead(identityId: string): Promise<void>;

  /**
   * 娓呯悊杩囨湡閫氱煡
   *
   * @param beforeTimestamp 鍦ㄦ鏃堕棿涔嬪墠鐨勯€氱煡
   */
  cleanupExpired(beforeTimestamp: number): Promise<number>;

  /**
   * 娓呯悊宸插垹闄ら€氱煡
   *
   * @param beforeTimestamp 鍦ㄦ鏃堕棿涔嬪墠鍒犻櫎鐨勯€氱煡
   */
  cleanupDeleted(beforeTimestamp: number): Promise<number>;
}
