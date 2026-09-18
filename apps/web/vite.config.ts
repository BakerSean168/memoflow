/// <reference types="vitest" />
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import {
  createAssetsAliasEntries,
  createContractsAliasEntries,
  createUiVueSourceAliasEntries,
  createWorkspaceSourceAliasEntries,
} from '../../vite.workspace-aliases';

const webDevWorkspaceEntries = [
  ['@memoflow/app-vue/modules/authentication', 'packages/app-vue/src/modules/authentication/index.ts'],
  ['@memoflow/app-vue/web-core', 'packages/app-vue/src/web-core.ts'],
  ['@memoflow/app-vue/web-shell-core', 'packages/app-vue/src/web-shell-core.ts'],
  ['@memoflow/app-vue/web-overlays', 'packages/app-vue/src/web-overlays.ts'],
  ['@memoflow/app-vue/web-shell', 'packages/app-vue/src/web-shell.ts'],
  ['@memoflow/app-vue/web-i18n', 'packages/app-vue/src/web-i18n.ts'],
  ['@memoflow/app-vue/web-bootstrap', 'packages/app-vue/src/web-bootstrap.ts'],
  ['@memoflow/app-vue', 'packages/app-vue/src/index.ts'],
  ['@memoflow/cloud-auth', 'packages/cloud-auth/src/index.ts'],
  ['@memoflow/goal/client', 'packages/goal/src/client/index.ts'],
  ['@memoflow/schedule/client', 'packages/schedule/src/client/index.ts'],
  ['@memoflow/notification/client', 'packages/notification/src/client/index.ts'],
  ['@memoflow/repository/client', 'packages/repository/src/client/index.ts'],
  ['@memoflow/task/client', 'packages/task/src/client/index.ts'],
  ['@memoflow/ai/client', 'packages/ai/src/client/index.ts'],
] as const;

/**
 * Vite Configuration for Web App
 *
 * ────────────────────────────────────────────────────────────────
 * Tailwind CSS 4 Configuration
 * ────────────────────────────────────────────────────────────────
 *
 * Tailwind 4 is CSS-first and no longer requires a config file.
 * All theme definitions are in: packages/ui-core/src/styles/theme.css
 *
 * The @tailwindcss/vite plugin:
 * - Processes @tailwindcss directives at build time
 * - Applies @theme definitions from theme.css
 * - Scans @source directories for CSS class discovery
 *
 * No tailwind.config.js needed — all configuration is CSS-based.
 */

export default defineConfig(({ mode, command }) => {
  // Load env files from workspace root (centralized .env files)
  const workspaceRoot = path.resolve(__dirname, '../..');
  const env = loadEnv(mode, workspaceRoot, '');

  // Dev mode: serve command or non-production mode
  const isDev = command === 'serve' || mode !== 'production';

  const directWorkspaceAliases = createWorkspaceSourceAliasEntries(
    workspaceRoot,
    webDevWorkspaceEntries,
  );

  const sharedWorkspaceAliases = [
    ...createAssetsAliasEntries(workspaceRoot),
    ...createWorkspaceSourceAliasEntries(workspaceRoot, [
    ]),
    ...(isDev ? createUiVueSourceAliasEntries(workspaceRoot) : []),
  ];

  const envSpecificAliases = isDev ? createContractsAliasEntries(workspaceRoot) : [];

  const resolveAliases = [
    ...directWorkspaceAliases,
    ...sharedWorkspaceAliases,
    ...envSpecificAliases,
    {
      find: '@',
      replacement: path.resolve(__dirname, './src'),
    },
  ];

  // Proxy target for API requests (local dev only)
  const proxyTarget = env.PROXY_TARGET_URL || env.API_URL || 'http://localhost:3000';

  const apiProxy: ProxyOptions = {
    target: proxyTarget,
    changeOrigin: true,
    secure: false,
    ws: true, // 支持 WebSocket
    // SSE 特定配置
    configure: (proxy) => {
      proxy.on('proxyRes', (proxyRes, req) => {
        // 确保 SSE 流不被缓冲和压缩
        if (req.url?.includes('/sse/')) {
          // 删除可能存在的压缩相关头
          delete proxyRes.headers['content-encoding'];
          // 防止下游再次压缩
          proxyRes.headers['x-no-compression'] = 'true';
        }
      });
      proxy.on('error', (err) => {
        console.error('[proxy]', err);
      });
    },
  };

  return {
    assetsInclude: ['**/*.icns'],
    worker: {
      format: 'es',
    },
    // Keep app root, but read env files from workspace root
    root: __dirname,
    envDir: workspaceRoot,
    envPrefix: 'VITE_',
    resolve: {
      alias: resolveAliases,
    },
    plugins: [
      vue({
        template: {
          transformAssetUrls: {
            base: null,
            includeAbsolute: false,
          },
        },
      }),
      // Tailwind CSS 4 plugin — handles CSS-first configuration
      tailwindcss(),
    ].filter(Boolean),
    server: {
      port: Number(env.VITE_DEV_PORT) || 5173,
      open: false,
      middlewareMode: false,
      // 完全禁用 Vite 的压缩中间件，避免破坏 SSE 流
      fs: {
        allow: ['..', '../../'],
      },
      // 添加代理配置,解决 EventSource 跨域问题
      // 仅在使用本地开发环境时启用代理
      proxy:
        mode === 'development'
          ? {
              '/api': apiProxy,
            }
          : undefined,
    },
    preview: {
      port: Number(env.VITE_DEV_PORT) || 5173,
      open: false,
    },
    build: {
      target: 'esnext',
      sourcemap: isDev,
      emptyOutDir: true,
    },
    test: {
      globals: true,
      environment: 'happy-dom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.spec.ts'],
      exclude: ['node_modules', 'dist', '.git', '.cache'],
      passWithNoTests: false,
      css: {
        modules: {
          classNameStrategy: 'non-scoped',
        },
      },
      // Mock CSS and asset imports
      server: {
        deps: {
          inline: [],
        },
      },
    },
  };
});
