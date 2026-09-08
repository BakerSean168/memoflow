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
        desktop: path.resolve(__dirname, 'src/desktop.ts'),
        'shared/utils/desktop-profile-access': path.resolve(
          __dirname,
          'src/shared/utils/desktop-profile-access.ts',
        ),
        'plugins/i18n': path.resolve(__dirname, 'src/plugins/i18n.ts'),
        'router/index': path.resolve(__dirname, 'src/router/index.ts'),
        'modules/authentication/index': path.resolve(
          __dirname,
          'src/modules/authentication/index.ts',
        ),
        'modules/account/index': path.resolve(__dirname, 'src/modules/account/index.ts'),
        'modules/goal/index': path.resolve(__dirname, 'src/modules/goal/index.ts'),
        'modules/task/index': path.resolve(__dirname, 'src/modules/task/index.ts'),
        'modules/schedule/index': path.resolve(__dirname, 'src/modules/schedule/index.ts'),
        'modules/reminder/index': path.resolve(__dirname, 'src/modules/reminder/index.ts'),
        'modules/notification/index': path.resolve(__dirname, 'src/modules/notification/index.ts'),
        'modules/repository/index': path.resolve(__dirname, 'src/modules/repository/index.ts'),
        'modules/setting/index': path.resolve(__dirname, 'src/modules/setting/index.ts'),
        'modules/governance/index': path.resolve(__dirname, 'src/modules/governance/index.ts'),
        'modules/dashboard/adapters/index': path.resolve(
          __dirname,
          'src/modules/dashboard/adapters/index.ts',
        ),
        'modules/ai/index': path.resolve(__dirname, 'src/modules/ai/index.ts'),
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
