import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

export default defineConfig({
  plugins: [
    vue(),
    dts({
      tsconfigPath: path.resolve(__dirname, 'tsconfig.json'),
      entryRoot: path.resolve(__dirname, 'src'),
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: [
        // 这几个组件的类型有问题，先排除掉
        'src/components/ui/carousel/**',
        'src/components/ui/drawer/**',
        'src/components/ui/stepper/**',
        // vue-tsc leaks private names (Props, EChartsElement) from child component types
        'src/components/custom/goal/dag/GoalDAGVisualization.vue',
        'src/**/*.stories.ts',
        'src/**/*.stories.vue',
        'src/**/*.test.ts',
        'src/stories/**', // 如果有单独的 stories 文件夹
      ],
      outDir: path.resolve(__dirname, 'dist'),
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  build: {
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        'components/ui/button/index': path.resolve(__dirname, 'src/components/ui/button/index.ts'),
        'components/ui/card/index': path.resolve(__dirname, 'src/components/ui/card/index.ts'),
        'components/ui/input/index': path.resolve(__dirname, 'src/components/ui/input/index.ts'),
        'components/ui/label/index': path.resolve(__dirname, 'src/components/ui/label/index.ts'),
        'components/ui/sonner/index': path.resolve(__dirname, 'src/components/ui/sonner/index.ts'),
        'components/ui/tabs/index': path.resolve(__dirname, 'src/components/ui/tabs/index.ts'),
        'components/ui/tooltip/index': path.resolve(
          __dirname,
          'src/components/ui/tooltip/index.ts',
        ),
        'composables/useProgressBar': path.resolve(__dirname, 'src/composables/useProgressBar.ts'),
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    sourcemap: true,
    rolldownOptions: {
      external,
      output: {
        exports: 'named',
      },
    },
  },
});
