import { createIdType } from './create-id-type';

import type { IdentityId as IIdentityId } from '@memoflow/shared-primitives';

/**
 * 全局 IdentityId 类型定义
 * 因为 IdentityId 在多个模块中使用（如 Account、Authentication 等）
 * 在所有模块中统一使用此类型以避免类型不兼容问题
 */
export const IdentityId = createIdType<IIdentityId>('IdentityId');
export type IdentityId = IIdentityId;
