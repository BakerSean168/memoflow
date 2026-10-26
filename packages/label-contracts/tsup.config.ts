/**
 * @memoflow/label-contracts 打包配置
 *
 * 包类型：Label 领域契约（颜色、DTO、命令/查询形状），真身自 contracts 迁入（P2 / Issue #634）
 * 打包工具：tsup (基于 esbuild)，与 contracts / shared-primitives 同款工厂配置
 */

import { createTsupConfig } from "../../tools/build/tsup.base.config.ts";

export default createTsupConfig({
  packageName: "@memoflow/label-contracts",
  entry: ["src/index.ts"],
  extraOptions: {
    dts: false,
  },
});
