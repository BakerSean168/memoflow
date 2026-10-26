/**
 * @memoflow/domain-shared 打包配置
 *
 * 包类型：共享域模型库
 * 打包工具：tsup (基于 esbuild)
 *
 * 选择原因：
 * - 跨平台共享域模型
 * - tsup 对跨平台支持好
 * - 支持 tree-shaking 和代码分割
 */

import { createLocalOnlyDtsPaths, createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/domain-shared',
  entry: [
    // 根入口
    'src/index.ts',
    // 当前仅保留 shared 子路径（其余模块入口已收缩）
    'src/shared/index.ts',
  ],
  external: ['@memoflow/utils'],
  extraOptions: {
    dts: createLocalOnlyDtsPaths(),
  },
});
