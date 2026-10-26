/**
 * @memoflow/goal-contracts 打包配置
 *
 * 包类型：Goal 领域契约（DTO、Schema、值对象、事件、协议），真身自 contracts 迁入（P2 / Issue #634）
 * 打包工具：tsup (基于 esbuild)，与 contracts / label-contracts 同款工厂配置
 * 额外入口：src/test-support/goal.mock.ts —— Goal mock 工厂的真身位置，供测试经
 * `@memoflow/goal-contracts/test-support/goal.mock` 引用（dev-only，不进根导出面）。
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/goal-contracts',
  entry: ['src/index.ts', 'src/test-support/goal.mock.ts'],
  extraOptions: {
    dts: false,
  },
});
