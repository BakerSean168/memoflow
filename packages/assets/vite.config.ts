/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import dts from 'vite-plugin-dts';

const configDir = import.meta.dirname;

// 复制目录的辅助函数
function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = resolve(src, entry.name);
    const destPath = resolve(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// 复制静态资源的插件
function copyAssetsPlugin() {
  return {
    name: 'copy-assets',
    closeBundle() {
      // 复制 logos
      copyDir(
        resolve(configDir, 'src/images/logos'),
        resolve(configDir, 'dist/images/logos')
      );
      // 复制 avatars
      copyDir(
        resolve(configDir, 'src/images/avatars'),
        resolve(configDir, 'dist/images/avatars')
      );
      // 复制 audio notifications
      copyDir(
        resolve(configDir, 'src/audio/notifications'),
        resolve(configDir, 'dist/audio/notifications')
      );
      console.log('✅ Static assets copied to dist');
    },
  };
}

export default defineConfig({
  assetsInclude: ['**/*.icns'],
  resolve: {
    alias: process.env.VITEST ? [
      { find: /\.icns$/, replacement: resolve(configDir, 'src/images/logos/MemoFlow.svg') }
    ] : []
  },
  plugins: [
    {
      name: 'mock-icns-for-vitest',
      enforce: 'pre',
      load(id) {
        if (id.includes('.icns')) {
          return `export default "/mock.icns";`;
        }
      }
    },
    dts({
      include: ['src/**/*.ts'],
      outDir: 'dist',
      // 生成多入口的类型声明
      rollupTypes: false,
    }),
    copyAssetsPlugin(),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(configDir, 'src/index.ts'),
        'images/index': resolve(configDir, 'src/images/index.ts'),
        'audio/index': resolve(configDir, 'src/audio/index.ts'),
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    outDir: 'dist',
    emptyOutDir: true,
    // 复制静态资源
    copyPublicDir: false,
    rolldownOptions: {
      output: {
        // 保持资源文件结构
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  // 确保资源 URL 正确处理
  base: './',
  test: {
    environment: 'node',
    // 强制 Vite 将其视作 external asset 或者直接 mock
    server: {
      deps: {
        inline: [/\.icns$/],
      },
    },
  },
});
