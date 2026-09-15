/**
 * @memoflow/contracts 打包配置
 *
 * 包类型：纯类型定义库（支持子路径导出）
 * 打包工具：tsup (基于 esbuild)
 *
 * 子路径导出优势：
 * - 极致的 Tree-Shaking
 * - 防止大型循环依赖
 * - 消费者只拉取需要的模块
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/contracts',
  // 多入口：支持子路径导出
  entry: [
    // 根入口（精简版，只导出核心类型和常用枚举）
    'src/index.ts',
    // 模块入口（完整模块导出）
    'src/modules/task/index.ts',
    'src/modules/goal/index.ts',
    'src/modules/governance/index.ts',
    'src/modules/reminder/index.ts',
    'src/modules/repository/index.ts',
    'src/modules/account/index.ts',
    'src/modules/schedule/index.ts',
    'src/modules/setting/index.ts',
    'src/modules/notification/index.ts',
    'src/modules/operations/index.ts',
    'src/modules/reliable-messaging/index.ts',
    'src/modules/ai/index.ts',
    'src/modules/dashboard/index.ts',
    'src/modules/data-portability/index.ts',
    'src/modules/label/index.ts',
    'src/modules/relation/index.ts',
    // 其他模块入口
    'src/result/index.ts',
    'src/shared/index.ts',
    'src/electron/index.ts',

    // 原语类型入口
    'src/primitives/index.ts',
    'src/primitives/command.ts',
    'src/primitives/runtime.ts',

    // Mock 数据生成器（仅用于开发/测试）
    'src/mocks/index.ts',
  ],
  extraOptions: {
    dts: false,
  },
});
