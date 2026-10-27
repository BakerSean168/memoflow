import type { AccountCreatedEvent } from '../domain/events/account-created.event';
import type { AccountClosedEvent } from '../domain/events/account-closed.event';
import type { AccountProfileUpdatedEvent } from '../domain/events/account-profile-updated.event';

/**
 * Account Module - Event Map
 * 账户模块 - 事件映射
 *
 * 事件命名规范：account:{kebab-action-past-tense}
 */
export type AccountEventMap = {
  'account:created': AccountCreatedEvent;
  'account:closed': AccountClosedEvent;
  'account:profile-updated': AccountProfileUpdatedEvent;
};
