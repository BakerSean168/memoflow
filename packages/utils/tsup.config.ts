/**
 * @memoflow/utils 打包配置
 *
 * 包类型：工具函数库
 * 打包工具：tsup (基于 esbuild)
 *
 * 选择原因：
 * - 工具函数需要最小化体积
 * - tsup 支持优秀的 tree-shaking
 * - 打包速度快，适合频繁修改
 */

import { baseLibraryConfig, createLocalOnlyDtsPaths } from '../../tools/build/tsup.base.config.ts';

const config = baseLibraryConfig('@memoflow/utils');

export default {
  ...config,
  entry: [
    'src/index.ts',
    'src/domain/index.ts',
    'src/errors/index.ts',
    'src/frontend/index.ts',
    'src/lifecycle/index.ts',
    'src/logger/index.ts',
    'src/result/index.ts',
    'src/shared/index.ts',
    'src/validation/index.ts',
    'src/winston.ts',
  ],
  external: [...(config.external || []), 'winston', 'winston-daily-rotate-file', 'zod'],
  dts: createLocalOnlyDtsPaths(),
};
