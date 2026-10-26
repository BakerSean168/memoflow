/**
 * CategoryPreference Value Object
 * 分类偏好值对象
 *
 * Residual 851: CategoryPreferenceDTO dual retired — sole CategoryPreference interface + type alias.
 */
import type { ImportanceLevel } from '@memoflow/shared-primitives';

/**
 * 渠道偏好配置
 * Residual 877: sole channel boolean-flags shape (ChannelConfig is type alias).
 */
export interface ChannelPreference {
  inApp: boolean;
  email: boolean;
  push: boolean;
  sms: boolean;
}

// Residual 851: sole CategoryPreference body.
export interface CategoryPreference {
  enabled: boolean;
  channels: ChannelPreference;
  importance: ImportanceLevel[];
}

// Residual 851: CategoryPreferenceDTO dual retired — DTO is the CategoryPreference shape.
export type CategoryPreferenceDTO = CategoryPreference;
