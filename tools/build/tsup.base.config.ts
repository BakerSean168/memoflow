/**
 * tsup 基础配置工厂函数
 *
 * 为所有 TypeScript 库包提供统一的打包配置
 *
 * 使用方法：
 * ```ts
 * import { createTsupConfig } from '../../tools/build/tsup.base.config';
 * export default createTsupConfig({ packageName: '@memoflow/utils' });
 * ```
 */

import type { Options } from 'tsup';

interface CreateTsupConfigOptions {
  /**
   * 包名（用于日志输出）
   * @example '@memoflow/contracts'
   */
  packageName: string;

  /**
   * 入口文件
   * @default ['src/index.ts']
   */
  entry?: string[];

  /**
   * 是否需要外部依赖处理
   * @default false
   */
  external?: string[];

  /**
   * 额外的 tsup 配置
   */
  extraOptions?: Partial<Options>;
}

export function createLocalOnlyDtsPaths(
  additionalPaths: Record<string, string[]> = {},
): NonNullable<Options['dts']> {
  return {
    compilerOptions: {
      // tsup 8.5 injects baseUrl into its TS6 declaration worker internally.
      ignoreDeprecations: '6.0',
      paths: {
        '@/*': ['./src/*'],
        ...additionalPaths,
      },
    },
  };
}

/**
 * 创建 tsup 配置
 */
export function createTsupConfig(options: CreateTsupConfigOptions): Options {
  const { packageName, entry = ['src/index.ts'], external = [], extraOptions = {} } = options;

  return {
    // ============================================================
    // 入口配置
    // ============================================================

    entry,

    // ============================================================
    // 输出配置
    // ============================================================

    // 输出格式：ESM (与 package.json type: "module" 一致)
    format: ['esm'],

    // 输出目录
    outDir: 'dist',

    // 目标环境：ES2020 (支持现代特性，兼容性好)
    target: 'es2020',

    // ============================================================
    // 类型声明配置
    // ============================================================

    // 使用 tsup 生成类型声明，但仅保留包内 alias，
    // 避免发布态声明构建继续追 workspace 源码图。
    dts: createLocalOnlyDtsPaths(),

    // ============================================================
    // 构建优化
    // ============================================================

    // 清理输出目录（避免旧文件残留）
    clean: true,

    // 生成 source map (便于调试)
    sourcemap: true,

    // 启用代码分割 (优化加载性能)
    // 注意：只有在 format 包含 'esm' 时才有效
    splitting: true,

    // 启用 tree-shaking (移除未使用的代码)
    treeshake: true,

    // 压缩代码 (生产环境)
    minify: false, // 库不压缩，让使用者决定是否压缩

    // ============================================================
    // TypeScript 配置
    // ============================================================

    // 使用项目的 tsconfig.json
    tsconfig: 'tsconfig.json',

    // 跳过 node_modules 类型检查 (加快构建速度)
    skipNodeModulesBundle: true,

    // ============================================================
    // 外部依赖
    // ============================================================

    // 标记外部依赖 (不打包到 bundle 中)
    external: [
      // 所有 @memoflow/* 包都是外部依赖
      /@memoflow\/.*/,
      ...external,
    ],

    // ============================================================
    // 输出配置
    // ============================================================

    // 静默输出 (减少构建日志)
    silent: false,

    // 合并额外配置（extraOptions 放在 onSuccess 之前，允许覆盖）
    ...extraOptions,

    // 构建成功回调（如果 extraOptions 中有 onSuccess，这里会被覆盖）
    ...(extraOptions.onSuccess === undefined && {
      onSuccess: async () => {
        console.log(`✅ ${packageName} 构建成功`);
      },
    }),
  };
}

/**
 * 预设配置：基础库包
 *
 * 适用于：contracts, domain-core, utils 等纯 TypeScript 库
 */
export const baseLibraryConfig = (packageName: string) =>
  createTsupConfig({
    packageName,
  });

/**
 * 预设配置：域模型包
 *
 * 适用于：domain-client, domain-server
 */
export const domainConfig = (packageName: string) =>
  createTsupConfig({
    packageName,
    // 域模型包通常依赖 contracts 和 utils
    external: ['@memoflow/contracts', '@memoflow/utils'],
  });
