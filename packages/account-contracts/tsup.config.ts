/**
 * @memoflow/account-contracts 打包配置
 *
 * 包类型：Account 领域契约（DTO、Schema、值对象、事件、协议、Port），
 * 真身自 contracts 迁入（Issue #630 §4.8 Account 域一次搬完）。
 * 打包工具：tsup (基于 esbuild)，与 contracts / goal-contracts / notification-contracts 同款工厂配置。
 * 额外入口：src/test-support/account.mock.ts —— Account mock 工厂的真身位置，
 * 供测试经 `@memoflow/account-contracts/test-support/account.mock` 引用
 * （dev-only，不进根导出面）。
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/account-contracts',
  entry: ['src/index.ts', 'src/test-support/account.mock.ts'],
  extraOptions: {
    dts: false,
  },
});
