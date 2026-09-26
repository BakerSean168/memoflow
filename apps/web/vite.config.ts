/// <reference types="vitest" />
import { defineConfig, loadEnv, type HotUpdateOptions, type Plugin, type ProxyOptions } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import {
  createAssetsAliasEntries,
  createContractsAliasEntries,
  createUiVueSourceAliasEntries,
  createWorkspaceSourceAliasEntries,
} from '../../vite.workspace-aliases.ts';

/**
 * `@tailwindcss/vite` 4.3.x expects the classic Vite dev-server `server` object in
 * its `hotUpdate` hook. Bundled dev intentionally invokes that hook with a
 * smaller context, so the upstream hook currently throws before Vite can apply
 * its own bundled HMR update. Skip only that classic-server invalidation helper
 * in bundled dev; Tailwind's transform hook still participates in each bundled
 * regeneration. Remove this adapter once the upstream plugin supports bundled
 * dev natively.
 */
function createTailwindPlugins(useBundledDev: boolean): Plugin[] {
  const plugins = tailwindcss();
  if (!useBundledDev) return plugins;

  return plugins.map((plugin) => {
    if (plugin.name !== '@tailwindcss/vite:generate:serve' || typeof plugin.hotUpdate !== 'function') {
      return plugin;
    }

    const upstreamHotUpdate = plugin.hotUpdate;
    return {
      ...plugin,
      hotUpdate(options) {
        if (!(options as Partial<HotUpdateOptions>).server) return;
        return upstreamHotUpdate.call(this, options);
      },
    };
  });
}

const webBundledDevWorkspaceEntries = [
  ['@memoflow/http-client', 'packages/http-client/src/index.ts'],
  ['@memoflow/utils/shared', 'packages/utils/src/shared/index.ts'],
] as const;

const webDevWorkspaceEntries = [
  // Keep narrow app-vue subpath aliases ahead of the package-root alias. A string
  // root alias also matches `/...` suffixes, so without this entry
  // `@memoflow/app-vue/di` would become `src/index.ts/di` and the auth bootstrap
  // would either fail production build or pull the full app-vue barrel in dev.
  ['@memoflow/app-vue/di', 'packages/app-vue/src/di/index.ts'],
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
  ['@memoflow/reminder/client', 'packages/reminder/src/client/index.ts'],
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

const configDir = import.meta.dirname;

export default defineConfig(({ mode, command }) => {
  // Load env files from workspace root (centralized .env files)
  const workspaceRoot = path.resolve(configDir, '../..');
  const env = loadEnv(mode, workspaceRoot, '');

  // Dev mode: serve command or non-production mode
  const isDev = command === 'serve' || mode !== 'production';
  // Vite's bundled dev mode keeps HMR while collapsing the browser-facing native-ESM
  // request graph. MemoFlow enables it for the persistent GCP host-dev lane, where the
  // browser normally reaches Vite through SSH/Tailscale and RTT magnifies module
  // waterfalls. Playwright keeps the classic unbundled server for deterministic CI.
  const useBundledDev =
    command === 'serve' &&
    mode === 'development' &&
    env.MEMOFLOW_VITE_BUNDLED_DEV === 'true' &&
    process.env.NODE_ENV !== 'test';
  // Rolldown's bundled dev defaults to lazy compilation. That is useful on a
  // local LAN, but each dynamic-import boundary becomes a request/compile round
  // trip over remote development links. Keep it explicitly tunable so the GCP
  // host-dev lane can prefer one stable upfront bundle instead.
  const useBundledDevLazy = env.MEMOFLOW_VITE_BUNDLED_DEV_LAZY !== 'false';

  const directWorkspaceAliases = createWorkspaceSourceAliasEntries(
    workspaceRoot,
    webDevWorkspaceEntries,
  );
  // Bundled Dev currently preserves a small set of linked workspace dist exports as
  // browser-facing bare specifiers. Pin only the observed browser-runtime entries to
  // source until Vite/Rolldown closes the linked-package gap.
  const bundledDevWorkspaceAliases = useBundledDev
    ? createWorkspaceSourceAliasEntries(workspaceRoot, webBundledDevWorkspaceEntries)
    : [];

  const sharedWorkspaceAliases = [
    ...createAssetsAliasEntries(workspaceRoot),
    ...createWorkspaceSourceAliasEntries(workspaceRoot, [
    ]),
    ...(isDev ? createUiVueSourceAliasEntries(workspaceRoot) : []),
  ];

  const envSpecificAliases = isDev ? createContractsAliasEntries(workspaceRoot) : [];

  const resolveAliases = [
    ...directWorkspaceAliases,
    ...bundledDevWorkspaceAliases,
    ...sharedWorkspaceAliases,
    ...envSpecificAliases,
    {
      find: '@',
      replacement: path.resolve(configDir, './src'),
    },
  ];

  // Tailscale Serve keeps Vite bound to loopback but forwards the public MagicDNS
  // hostname through HTTPS. Allow only the configured public development hostname
  // instead of disabling Vite's host-header protection globally.
  let allowedDevHosts: string[] | undefined;
  if (isDev && env.MEMOFLOW_WEB_URL) {
    try {
      const hostname = new URL(env.MEMOFLOW_WEB_URL).hostname;
      if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '[::1]') {
        allowedDevHosts = [hostname];
      }
    } catch {
      // API env validation owns URL diagnostics. Keep classic Vite defaults here.
    }
  }

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
    experimental: {
      bundledDev: useBundledDev,
    },
    worker: {
      format: 'es',
    },
    // Keep app root, but read env files from workspace root
    root: configDir,
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
      // Tailwind CSS 4 plugin — handles CSS-first configuration. The small
      // adapter above is bundled-dev-only and leaves classic dev/build untouched.
      ...createTailwindPlugins(useBundledDev),
    ].filter(Boolean),
    server: {
      port: Number(env.VITE_DEV_PORT) || 5173,
      strictPort: true,
      open: false,
      allowedHosts: allowedDevHosts,
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
      outDir: path.resolve(workspaceRoot, 'dist/apps/web'),
      sourcemap: isDev,
      emptyOutDir: true,
      rolldownOptions: useBundledDev
        ? {
            experimental: {
              devMode: {
                lazy: useBundledDevLazy,
              },
            },
          }
        : undefined,
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
