/**
 * @memoflow/data-portability-contracts 打包配置
 *
 * 包类型：数据可移植域契约（导入导出 DTO、portable v3 基座、profile-import 领域 Schema、
 * DataSnapshotId）。基座于 P2 先行成包，其余契约在 #630 §4.11 一次迁入。
 * 打包工具：tsup (基于 esbuild)，与 goal-contracts / label-contracts 同款工厂配置
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/data-portability-contracts',
  entry: ['src/index.ts'],
  extraOptions: {
    dts: false,
  },
});
