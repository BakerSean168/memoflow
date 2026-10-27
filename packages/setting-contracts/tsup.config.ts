/**
 * @memoflow/setting-contracts 打包配置
 *
 * 包类型：Setting 领域契约（DTO、Schema、值对象、事件、协议、preferences 组合），
 * 真身自 @memoflow/setting-contracts 迁入（Issue #630 §4.9）。
 * 打包工具：tsup (基于 esbuild)，与 contracts / notification-contracts 同款工厂配置。
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/setting-contracts',
  entry: ['src/index.ts'],
  extraOptions: {
    dts: false,
  },
});
