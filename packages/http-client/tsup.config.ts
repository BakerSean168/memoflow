/**
 * @memoflow/http-client 打包配置
 *
 * 包类型：HTTP 客户端共享内核
 * 打包工具：tsup (基于 esbuild)
 */

import { baseLibraryConfig, createLocalOnlyDtsPaths } from '../../tools/build/tsup.base.config.ts';

const config = baseLibraryConfig('@memoflow/http-client');

export default {
  ...config,
  entry: ['src/index.ts'],
  dts: createLocalOnlyDtsPaths(),
  external: [...(config.external || []), 'axios'],
};
