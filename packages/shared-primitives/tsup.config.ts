/**
 * @memoflow/shared-primitives 打包配置
 *
 * 包类型：共享基础原语（品牌类型、时间原语、Zod 扩展、命令信封）
 * 打包工具：tsup (基于 esbuild)，与 contracts 同款工厂配置
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/shared-primitives',
  // 多入口：根入口 + 有深路径消费的运行时入口（与从 contracts 迁入前的产物面一致）
  entry: ['src/index.ts', 'src/command.ts', 'src/runtime.ts'],
  extraOptions: {
    dts: false,
  },
});
