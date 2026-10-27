/**
 * @memoflow/goal-workspace-contracts 打包配置
 *
 * 包类型：跨域组合契约（Goal Workspace 读模型、Goal/Label portable v3 组合），
 * 只做只读组装投影，叶子契约仍归各业务 contracts 包所有（P3 协作契约 / Issue #635）。
 * 打包工具：tsup (基于 esbuild)，与 contracts / label-contracts 同款工厂配置
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/goal-workspace-contracts',
  entry: ['src/index.ts'],
  extraOptions: {
    dts: false,
  },
});
