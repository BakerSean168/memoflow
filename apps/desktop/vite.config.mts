/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import electron from 'vite-plugin-electron/simple';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import {
  electronExternalWorkspacePackages,
  electronJsExternalPackages,
  electronNativeModules,
} from './runtime-external.config.mjs';
import {
  createAppVueSourceAliasEntries,
  createAssetsAliasEntries,
  createReliableMessagingContractsAliasEntries,
  createOperationsContractsAliasEntries,
  createNotificationContractsAliasEntries,
  createContractsAliasEntries,
  createUiVueSourceAliasEntries,
  createWorkspaceSourceAliasEntries,
} from '../../vite.workspace-aliases.ts';

const desktopRendererDevWorkspaceEntries = [
  ['@memoflow/ai/client', 'packages/ai/src/client/index.ts'],
  ['@memoflow/ai/electron', 'packages/ai/src/electron/index.ts'],
  ['@memoflow/goal-client', 'packages/goal-client/src/index.ts'],
  ['@memoflow/goal-core/ids', 'packages/goal-core/src/ids.ts'],
  [
    '@memoflow/goal-core/key-result-progress-calculator',
    'packages/goal-core/src/key-result-progress-calculator.ts',
  ],
  ['@memoflow/goal-core/goal-record-preview', 'packages/goal-core/src/goal-record-preview.ts'],
  ['@memoflow/goal-core', 'packages/goal-core/src/index.ts'],
  ['@memoflow/shared-primitives/command', 'packages/shared-primitives/src/command.ts'],
  ['@memoflow/shared-primitives/duration', 'packages/shared-primitives/src/duration.ts'],
  ['@memoflow/shared-primitives/hm', 'packages/shared-primitives/src/hm.ts'],
  ['@memoflow/shared-primitives/ids', 'packages/shared-primitives/src/ids.ts'],
  ['@memoflow/shared-primitives/instant', 'packages/shared-primitives/src/instant.ts'],
  ['@memoflow/shared-primitives/runtime', 'packages/shared-primitives/src/runtime.ts'],
  ['@memoflow/shared-primitives/time-zone-id', 'packages/shared-primitives/src/time-zone-id.ts'],
  ['@memoflow/shared-primitives/transfer-date', 'packages/shared-primitives/src/transfer-date.ts'],
  ['@memoflow/shared-primitives/ymd', 'packages/shared-primitives/src/ymd.ts'],
  [
    '@memoflow/shared-primitives/zod-extensions',
    'packages/shared-primitives/src/zod-extensions.ts',
  ],
  ['@memoflow/shared-primitives', 'packages/shared-primitives/src/index.ts'],
  [
    '@memoflow/transport-contracts/result/codes',
    'packages/transport-contracts/src/result/codes.ts',
  ],
  ['@memoflow/transport-contracts/result/core', 'packages/transport-contracts/src/result/core.ts'],
  [
    '@memoflow/transport-contracts/result/failure-compat',
    'packages/transport-contracts/src/result/failure-compat.ts',
  ],
  [
    '@memoflow/transport-contracts/result/failure-policy',
    'packages/transport-contracts/src/result/failure-policy.ts',
  ],
  ['@memoflow/transport-contracts/result/http', 'packages/transport-contracts/src/result/http.ts'],
  ['@memoflow/transport-contracts/result/ipc', 'packages/transport-contracts/src/result/ipc.ts'],
  [
    '@memoflow/transport-contracts/result/public-failure',
    'packages/transport-contracts/src/result/public-failure.ts',
  ],
  ['@memoflow/transport-contracts/result', 'packages/transport-contracts/src/result/index.ts'],
  ['@memoflow/transport-contracts/context', 'packages/transport-contracts/src/context.ts'],
  [
    '@memoflow/transport-contracts/execution-context',
    'packages/transport-contracts/src/execution-context.ts',
  ],
  ['@memoflow/transport-contracts', 'packages/transport-contracts/src/index.ts'],
  ['@memoflow/label-contracts', 'packages/label-contracts/src/index.ts'],
  ['@memoflow/relation-contracts', 'packages/relation-contracts/src/index.ts'],
  ['@memoflow/data-portability-contracts', 'packages/data-portability-contracts/src/index.ts'],
  [
    '@memoflow/goal-contracts/test-support/goal.mock',
    'packages/goal-contracts/src/test-support/goal.mock.ts',
  ],
  ['@memoflow/goal-contracts', 'packages/goal-contracts/src/index.ts'],
  ['@memoflow/goal-ui/composables/useGoal', 'packages/goal-ui/src/composables/useGoal.ts'],
  ['@memoflow/goal-ui/host', 'packages/goal-ui/src/goal-ui-host.ts'],
  ['@memoflow/notification-ui/host', 'packages/notification-ui/src/notification-ui-host.ts'],
  ['@memoflow/notification-ui', 'packages/notification-ui/src/index.ts'],
  ['@memoflow/goal-ui', 'packages/goal-ui/src/index.ts'],
  ['@memoflow/workspace-contracts', 'packages/workspace-contracts/src/index.ts'],
  ['@memoflow/desktop-contracts/auth-context', 'packages/desktop-contracts/src/auth-context.ts'],
  ['@memoflow/desktop-contracts/database', 'packages/desktop-contracts/src/database.ts'],
  [
    '@memoflow/desktop-contracts/desktop-update',
    'packages/desktop-contracts/src/desktop-update.ts',
  ],
  [
    '@memoflow/desktop-contracts/device-notification-preference',
    'packages/desktop-contracts/src/device-notification-preference.ts',
  ],
  ['@memoflow/desktop-contracts/focus-window', 'packages/desktop-contracts/src/focus-window.ts'],
  [
    '@memoflow/desktop-contracts/intervention-window',
    'packages/desktop-contracts/src/intervention-window.ts',
  ],
  ['@memoflow/desktop-contracts/ipc-channels', 'packages/desktop-contracts/src/ipc-channels.ts'],
  [
    '@memoflow/desktop-contracts/profile-access',
    'packages/desktop-contracts/src/profile-access.ts',
  ],
  ['@memoflow/desktop-contracts', 'packages/desktop-contracts/src/index.ts'],
  ['@memoflow/host-runtime/electron-ipc', 'packages/host-runtime/src/electron-ipc/index.ts'],
  ['@memoflow/host-runtime', 'packages/host-runtime/src/index.ts'],
  ['@memoflow/goal/electron', 'packages/goal/src/electron/index.ts'],
  ['@memoflow/ipc-client', 'packages/ipc-client/src/index.ts'],
  ['@memoflow/cloud-auth', 'packages/cloud-auth/src/index.ts'],
  ['@memoflow/task/client', 'packages/task/src/client/index.ts'],
  ['@memoflow/schedule-client', 'packages/schedule-client/src/index.ts'],
  ['@memoflow/schedule/electron', 'packages/schedule/src/electron/index.ts'],
  ['@memoflow/notification-client', 'packages/notification-client/src/index.ts'],
  ['@memoflow/routine-client', 'packages/routine-client/src/index.ts'],
  ['@memoflow/notification/electron', 'packages/notification/src/electron/index.ts'],
] as const;

const nativeModules = electronNativeModules;
const workspaceExternal = electronExternalWorkspacePackages;
const electronMainExternalList = [...nativeModules, ...electronJsExternalPackages];

function isElectronMainExternal(id: string): boolean {
  if (electronMainExternalList.includes(id)) return true;
  for (const pkg of workspaceExternal) {
    if (id === pkg) return true;
    if (id.startsWith(pkg + '/')) return true;
  }
  return false;
}

// Workspace packages to exclude from optimizeDeps
const workspacePkgs = [
  '@memoflow/utils',
  '@memoflow/contracts',
  '@memoflow/app-vue',
  '@memoflow/goal-ui',
  '@memoflow/notification-ui',
  '@memoflow/ui-vue-shadcn',
  '@memoflow/ipc-client',
  '@memoflow/assets',
];

// https://vitejs.dev/config/
const configDir = import.meta.dirname;

export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve' || mode !== 'production';
  const workspaceRoot = path.resolve(configDir, '../..');
  const env = loadEnv(mode, workspaceRoot, '');
  Object.assign(process.env, env);
  const devWorkspaceAliases = isDev
    ? [
        ...createAppVueSourceAliasEntries(workspaceRoot),
        ...createAssetsAliasEntries(workspaceRoot),
        ...createUiVueSourceAliasEntries(workspaceRoot),
        ...createReliableMessagingContractsAliasEntries(workspaceRoot),
        ...createOperationsContractsAliasEntries(workspaceRoot),
        ...createNotificationContractsAliasEntries(workspaceRoot),
        ...createContractsAliasEntries(workspaceRoot),
        ...createWorkspaceSourceAliasEntries(workspaceRoot, desktopRendererDevWorkspaceEntries),
      ]
    : createAssetsAliasEntries(workspaceRoot);

  const rendererAliases = [
    ...devWorkspaceAliases,
    ...createWorkspaceSourceAliasEntries(workspaceRoot, []),
    {
      find: '@main',
      replacement: path.resolve(configDir, './src/main'),
    },
    {
      find: '@preload',
      replacement: path.resolve(configDir, './src/preload'),
    },
    {
      find: '@renderer',
      replacement: path.resolve(configDir, './src/renderer'),
    },
    {
      find: '@',
      replacement: path.resolve(configDir, './src'),
    },
    {
      find: 'crypto',
      replacement: 'crypto-browserify',
    },
    {
      find: 'stream',
      replacement: 'stream-browserify',
    },
    {
      find: 'buffer',
      replacement: 'buffer',
    },
  ];

  return {
    assetsInclude: ['**/*.icns'],
    resolve: {
      conditions: ['import', 'module', 'default'],
      dedupe: ['vue', 'vue-router', 'pinia', 'vue-i18n'],
      alias: rendererAliases,
    },
    define: {
      global: 'globalThis',
    },
    worker: {
      format: 'es',
    },
    base: './',
    build: {
      outDir: 'dist-renderer',
      rolldownOptions: {
        input: path.resolve(configDir, 'index.html'),
        external: nativeModules,
      },
    },
    optimizeDeps: {
      exclude: [...nativeModules, ...workspacePkgs],
    },
    server: {
      port: Number(env.VITE_DEV_PORT) || 5173,
      open: false,
      fs: {
        allow: [workspaceRoot],
      },
    },
    test: {
      globals: true,
      include: ['src/**/*.test.ts'],
      environment: 'jsdom',
    },
    plugins: [
      vue(),
      tailwindcss(),
      electron({
        main: {
          entry: path.resolve(configDir, 'src/main/main.ts'),
          vite: {
            resolve: {
              alias: [
                {
                  find: '@main',
                  replacement: path.resolve(configDir, './src/main'),
                },
                {
                  find: '@preload',
                  replacement: path.resolve(configDir, './src/preload'),
                },
                {
                  find: '@renderer',
                  replacement: path.resolve(configDir, './src/renderer'),
                },
              ],
            },
            build: {
              outDir: 'dist-electron',
              rolldownOptions: {
                external: isElectronMainExternal,
                // Rolldown 1.2.9 panics while tree shaking Mastra's filesystem re-export.
                treeshake: false,
                output: {
                  format: 'cjs',
                  entryFileNames: '[name].cjs',
                  chunkFileNames: '[name].cjs',
                  assetFileNames: '[name].[ext]',
                },
              },
            },
            optimizeDeps: {
              exclude: [...nativeModules, ...workspacePkgs],
            },
          },
        },
        preload: {
          input: {
            preload: path.resolve(configDir, 'src/preload/preload.ts'),
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              rolldownOptions: {
                external: nativeModules,
                output: {
                  format: 'cjs',
                  inlineDynamicImports: false,
                  entryFileNames: '[name].cjs',
                },
              },
            },
            optimizeDeps: {
              exclude: [...nativeModules, ...workspacePkgs],
            },
          },
        },
        renderer: process.env.NODE_ENV === 'test' ? undefined : {},
      }),
    ],
  };
});
