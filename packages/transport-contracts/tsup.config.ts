/**
 * @memoflow/transport-contracts 打包配置
 *
 * 包类型：传输层契约（Result 信封、PublicFailure、HTTP/IPC 纯转换、执行上下文）
 * 打包工具：tsup (基于 esbuild)，与 contracts / shared-primitives 同款工厂配置
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/transport-contracts',
  // 多入口：根入口 + 全部源文件。exports './*' 广告了每个子路径，凡含运行时
  // 导出的文件（result/* 的信封与转换实现）都必须有对应 .js，否则以包说明符
  // 深路径导入的打包产物会在 Node 解析时落空；纯类型文件（context /
  // execution-context）一并发出，保持子路径在类型与运行时两侧一致可解析。
  entry: [
    'src/index.ts',
    'src/context.ts',
    'src/execution-context.ts',
    'src/result/index.ts',
    'src/result/codes.ts',
    'src/result/core.ts',
    'src/result/failure-compat.ts',
    'src/result/failure-policy.ts',
    'src/result/http.ts',
    'src/result/ipc.ts',
    'src/result/public-failure.ts',
  ],
  extraOptions: {
    dts: false,
  },
});
