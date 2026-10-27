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
        host: path.resolve(__dirname, 'src/ai-ui-host.ts'),
        index: path.resolve(__dirname, 'src/index.ts'),
        router: path.resolve(__dirname, 'src/router/index.ts'),
        'components/AIComposerControls.vue': path.resolve(
          __dirname,
          'src/components/AIComposerControls.vue',
        ),
        'components/AgentDriverIcon.vue': path.resolve(
          __dirname,
          'src/components/AgentDriverIcon.vue',
        ),
        'views/AIChatView.vue': path.resolve(__dirname, 'src/views/AIChatView.vue'),
        'composables/chatViewHelpers': path.resolve(
          __dirname,
          'src/composables/chatViewHelpers.ts',
        ),
        'composables/error': path.resolve(__dirname, 'src/composables/error.ts'),
        'composables/useAI': path.resolve(__dirname, 'src/composables/useAI.ts'),
        'composables/nativeModelVisibility': path.resolve(
          __dirname,
          'src/composables/nativeModelVisibility.ts',
        ),
        'agent-instance-order': path.resolve(__dirname, 'src/agent-instance-order.ts'),
        'composables/useConversationAttention': path.resolve(
          __dirname,
          'src/composables/useConversationAttention.ts',
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
