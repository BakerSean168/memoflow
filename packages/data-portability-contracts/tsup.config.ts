/**
 * @memoflow/data-portability-contracts 打包配置
 *
 * 包类型：数据可移植基座契约（portable v3 envelope / reference 基座）。
 * 各业务域的 portable 组合契约引用本基座；基座本体自 contracts 先行抽出（P2 / Issue #634）。
 * 打包工具：tsup (基于 esbuild)，与 contracts / label-contracts 同款工厂配置
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/data-portability-contracts',
  entry: ['src/index.ts'],
  extraOptions: {
    dts: false,
  },
});
