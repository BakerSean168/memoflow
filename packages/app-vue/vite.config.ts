import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

export default defineConfig({
  plugins: [
    vue(),
    dts({
      tsconfigPath: path.resolve(__dirname, 'tsconfig.build.json'),
      entryRoot: path.resolve(__dirname, 'src'),
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: [
        'src/**/*.stories.ts',
        'src/**/*.stories.vue',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
      ],
      outDir: path.resolve(__dirname, 'dist'),
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        'web-overlays': path.resolve(__dirname, 'src/web-overlays.ts'),
        'di/index': path.resolve(__dirname, 'src/di/index.ts'),
        'di/keys': path.resolve(__dirname, 'src/di/keys.ts'),
        'di/schedule-ui-host': path.resolve(__dirname, 'src/di/schedule-ui-host.ts'),
        desktop: path.resolve(__dirname, 'src/desktop.ts'),
        'shared/utils/desktop-profile-access': path.resolve(
          __dirname,
          'src/shared/utils/desktop-profile-access.ts',
        ),
        'shared/utils/product-time': path.resolve(__dirname, 'src/shared/utils/product-time.ts'),
        'plugins/i18n': path.resolve(__dirname, 'src/plugins/i18n.ts'),
        'router/index': path.resolve(__dirname, 'src/router/index.ts'),
        // Renderer bootstrap and host composition entry points consumed by the
        // Web/Desktop shells; the export map must name them so Node resolution
        // stays truthful outside Vite's alias table.
        'web-core': path.resolve(__dirname, 'src/web-core.ts'),
        'web-shell-core': path.resolve(__dirname, 'src/web-shell-core.ts'),
        'web-bootstrap': path.resolve(__dirname, 'src/web-bootstrap.ts'),
        'web-i18n': path.resolve(__dirname, 'src/web-i18n.ts'),
        'platform/server-state': path.resolve(__dirname, 'src/platform/server-state/index.ts'),
        'locales/production-messages': path.resolve(
          __dirname,
          'src/locales/production-messages.ts',
        ),
        // E2E shell fixtures mount the real layout components instead of stubs.
        'layouts/shell/AppShell.vue': path.resolve(__dirname, 'src/layouts/shell/AppShell.vue'),
        'layouts/shell/previews/ScheduleCapsulePreview.vue': path.resolve(
          __dirname,
          'src/layouts/shell/previews/ScheduleCapsulePreview.vue',
        ),
        'layouts/shell/useAppShellStore': path.resolve(
          __dirname,
          'src/layouts/shell/useAppShellStore.ts',
        ),
        'layouts/shell/usePanelWidth': path.resolve(
          __dirname,
          'src/layouts/shell/usePanelWidth.ts',
        ),
        'shared/components/GlobalConfirmDialog.vue': path.resolve(
          __dirname,
          'src/shared/components/GlobalConfirmDialog.vue',
        ),
        'components/shared/ListPageShell.vue': path.resolve(
          __dirname,
          'src/components/shared/ListPageShell.vue',
        ),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rolldownOptions: {
      external: (id) => external.some((dep) => id === dep || id.startsWith(dep + '/')),
      output: {
        exports: 'named',
      },
    },
  },
});
