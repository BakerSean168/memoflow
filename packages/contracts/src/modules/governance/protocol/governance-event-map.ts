/**
 * Governance event contract surface for the asynchronous module seam.
 * 治理模块异步 seam 的事件契约面。
 *
 * This file is the single protocol map that transport adapters and subscribers
 * use to agree on event names and payload types.
 * 这是传输适配器与订阅方对齐事件名和 payload 类型的唯一协议映射。
 */
import type {
  RuleCreatedEvent,
  RuleUpdatedEvent,
  RuleDeletedEvent,
  RuleDeprecatedEvent,
  RuleReactivatedEvent,
  RuleStatusChangedEvent,
  RuleSeverityChangedEvent,
} from '../domain/events';

/**
 * Governance Module - Event Map
 * 规则治理模块 - 事件映射
 *
 * 【规范说明：事件映射】
 * 定义模块发出的所有领域事件，用于模块间异步通信。
 *
 * 【事件命名规范 ★ 所有业务模块必须遵循】
 * 标准格式：{module}:{kebab-entity}-{kebab-action-past-tense}
 *
 * ✅ 正确示例：
 *   governance:rule-created         — 规则创建
 *   governance:rule-updated         — 规则更新
 *   governance:rule-deprecated      — 规则废弃
 *   governance:rule-status-changed  — 规则状态变更
 *   auth:identity-created           — 认证身份创建
 *   schedule:task-created           — 日程任务创建（子实体）
 *
 * ❌ 错误示例：
 *   account:create                  — 缺少过去式后缀，应为 account:created
 *   editor:EditorWorkspaceUpdatedEvent — 使用了类名，应为 editor:workspace-updated
 *   ai.conversation.created         — 使用了点分隔符，应为 ai:conversation-created
 *
 * 参见：docs/standards/contract-module-development-spec.md
 * 参见：docs/standards/domain-event-spec.md
 *
 * 【使用场景】
 * - 事件发布：eventBus.publish('governance:rule-created', payload)
 * - 事件订阅：eventBus.subscribe('governance:rule-created', handler)
 *
 * 【关于 payload-only】
 * utils 的 addDomainEvent 能接收 type 和 payload，自动生成 aggregateId 和 occurredAt，
 * 所以 Event 接口中不需要包含这些信封字段。
 */
export type GovernanceEventMap = {
  /**
   * 规则创建事件
   * 新规则创建成功后发出
   */
  'governance:rule-created': RuleCreatedEvent;

  /**
   * 规则更新事件
   * 规则内容更新后发出
   */
  'governance:rule-updated': RuleUpdatedEvent;

  /**
   * 规则废弃事件
   * 规则被废弃后发出
   */
  'governance:rule-deprecated': RuleDeprecatedEvent;

  /**
   * 规则重新激活事件
   * 已废弃的规则重新激活后发出
   */
  'governance:rule-reactivated': RuleReactivatedEvent;

  /**
   * 规则状态变更事件（通用）
   * 规则状态发生任何变更时发出
   */
  'governance:rule-status-changed': RuleStatusChangedEvent;

  /**
   * 规则严重级别变更事件
   * 规则严重级别发生变更时发出
   */
  'governance:rule-severity-changed': RuleSeverityChangedEvent;

  /**
   * Rule deleted event. Emitted after a rule is hard-deleted.
   * 规则删除事件。规则被硬删除后发出。
   */
  'governance:rule-deleted': RuleDeletedEvent;
};
