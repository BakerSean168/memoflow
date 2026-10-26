/**
 * @memoflow/notification-contracts 打包配置
 *
 * 包类型：Notification 领域契约（DTO、Schema、值对象、事件、协议、集成信封），
 * 真身自 contracts 迁入（Issue #630 §4.5 Notification 域一次搬完）。
 * 打包工具：tsup (基于 esbuild)，与 contracts / goal-contracts 同款工厂配置。
 * 额外入口：src/test-support/notification.mock.ts —— Notification mock 工厂的真身位置，
 * 供测试经 `@memoflow/notification-contracts/test-support/notification.mock` 引用
 * （dev-only，不进根导出面）。
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/notification-contracts',
  entry: ['src/index.ts', 'src/test-support/notification.mock.ts'],
  extraOptions: {
    dts: false,
  },
});
