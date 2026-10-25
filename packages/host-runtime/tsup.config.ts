/**
 * @memoflow/host-runtime 打包配置
 *
 * 包类型：宿主运行时（模块清单/命令注册表 + 桌面 IPC 鉴权中间件工厂）
 * 打包工具：tsup (基于 esbuild)，与 contracts / transport-contracts 同款工厂配置
 */

import { createTsupConfig } from "../../tools/build/tsup.base.config.ts";

export default createTsupConfig({
  packageName: "@memoflow/host-runtime",
  // 多入口：根入口（module-manifest + server-module-context）与 electron-ipc
  // 子路径入口，与 package.json exports 的 "." / "./electron-ipc" 一一对应。
  entry: ["src/index.ts", "src/electron-ipc/index.ts"],
  extraOptions: {
    dts: false,
  },
});
