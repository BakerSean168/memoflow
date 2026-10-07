import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { defineConfig } from 'tsup';

export default defineConfig({
  // Runtime packages must resolve through exports, sharing logger/auth singletons
  // across preflight and server. Source aliases belong to typechecking only.
  tsconfig: 'tsconfig.bundle.json',
  // Entry point. `main.ts` is the preflight entry that dynamically imports
  // `server.ts`; both are emitted as separate dist files so the dynamic import
  // stays a real runtime boundary (feature graph loads only after the logger
  // provider is initialized).
  // 入口。`main.ts` 是动态导入 `server.ts` 的 preflight 入口；两者作为独立
  // dist 文件输出，使动态 import 成为真正的运行时边界（feature 依赖图只在
  // logger provider 初始化后加载）。
  entry: ['src/main.ts', 'src/server.ts'],

  // Output format: ESM only (matches package.json "type": "module")
  format: ['esm'],

  // Target Node.js version
  target: 'node20',

  // Output directory
  outDir: 'dist',

  // Generate source maps for debugging
  sourcemap: true,

  // Clean output directory before build
  clean: true,

  // Disable code splitting (keep single output file for simplicity)
  splitting: false,

  // Enable tree shaking
  treeshake: true,

  // Generate TypeScript declaration files
  // TEMPORARY: Disabled due to tsconfig composite project issues
  // dts: true,
  dts: false,

  // esbuild options for module resolution
  esbuildOptions(options) {
    // Allow importing .ts files without extension
    options.resolveExtensions = ['.ts', '.js', '.mjs', '.json'];
    // Keep the preflight → server boundary as a real dynamic import instead of
    // inlining server.ts into the main bundle.
    options.external = [...(options.external ?? []), './server.js'];
  },

  // Runtime artifact policy: workspace Modules stay behind their package
  // Interface, while third-party packages are derived from package.json/node_modules
  // instead of repeated as a second handwritten dependency manifest here.
  skipNodeModulesBundle: true,
  external: [/^@memoflow\//, '@prisma/client', '@powersync/node'],

  // Build targets must be one-shot and must not inherit watch mode from ambient NODE_ENV.
  watch: false,

  // Success message
  onSuccess: async () => {
    for (const file of ['dist/main.js', 'dist/server.js']) {
      const artifact = await readFile(file, 'utf8');
      assert.match(artifact, /from ["']@memoflow\/utils\/logger["']/);
      assert.doesNotMatch(artifact, /loggerCache = new Map|var LoggerFactory/);
    }
    console.log('✅ Build successful; shared logger package boundary verified');
  },
});
