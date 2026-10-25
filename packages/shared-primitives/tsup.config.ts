/**
 * @memoflow/shared-primitives 打包配置
 *
 * 包类型：共享基础原语（品牌类型、时间原语、Zod 扩展、命令信封）
 * 打包工具：tsup (基于 esbuild)，与 contracts 同款工厂配置
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/shared-primitives',
  // 多入口：根入口 + 全部源文件。exports './*' 广告了每个子路径，凡含运行时
  // 导出的文件（command/runtime/zod-extensions/ids/ymd/time-zone-id）都必须有
  // 对应 .js，否则以包说明符深路径导入的打包产物会在 Node 解析时落空；
  // 纯类型文件一并发出，保持子路径在类型与运行时两侧一致可解析。
  entry: [
    'src/index.ts',
    'src/command.ts',
    'src/duration.ts',
    'src/hm.ts',
    'src/ids.ts',
    'src/instant.ts',
    'src/runtime.ts',
    'src/time-zone-id.ts',
    'src/transfer-date.ts',
    'src/ymd.ts',
    'src/zod-extensions.ts',
  ],
  extraOptions: {
    dts: false,
  },
});
