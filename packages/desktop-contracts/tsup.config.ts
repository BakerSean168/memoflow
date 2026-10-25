/**
 * @memoflow/desktop-contracts 打包配置
 *
 * 包类型：桌面平台契约（渠道常量、桌面功能 Schema、宿主 Port 接口）
 * 打包工具：tsup (基于 esbuild)，与 contracts / transport-contracts 同款工厂配置
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/desktop-contracts',
  // 多入口：根入口 + 全部源文件。exports './*' 广告了每个子路径，凡含运行时
  // 导出的文件（渠道常量、Zod Schema、错误类）都必须有对应 .js，否则以包说明符
  // 深路径导入的打包产物会在 Node 解析时落空；纯类型文件（database 的 Port
  // 接口）一并发出，保持子路径在类型与运行时两侧一致可解析。
  entry: [
    'src/index.ts',
    'src/auth-context.ts',
    'src/database.ts',
    'src/desktop-update.ts',
    'src/device-notification-preference.ts',
    'src/focus-window.ts',
    'src/intervention-window.ts',
    'src/ipc-channels.ts',
    'src/profile-access.ts',
  ],
  extraOptions: {
    dts: false,
  },
});
