/**
 * @memoflow/task-contracts 打包配置
 *
 * 包类型：Task 领域契约（DTO、Schema、值对象、事件、协议、Task 系 branded ID），
 * 真身自 @memoflow/contracts/modules/task 迁入（Issue #630 §4.2 / #635）。
 * 打包工具：tsup (基于 esbuild)，与 contracts / goal-contracts 同款工厂配置
 * 额外入口：src/test-support/task.mock.ts —— Task mock 工厂的真身位置，供测试经
 * `@memoflow/task-contracts/test-support/task.mock` 引用（dev-only，不进根导出面）。
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/task-contracts',
  entry: ['src/index.ts', 'src/test-support/task.mock.ts'],
  extraOptions: {
    dts: false,
  },
});
