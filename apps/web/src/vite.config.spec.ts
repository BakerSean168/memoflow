import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config';

describe('web Vite development configuration', () => {
  it('routes both versioned APIs and Better Auth through the shared /api boundary', async () => {
    expect(typeof viteConfig).toBe('function');
    if (typeof viteConfig !== 'function') return;

    const config = await viteConfig({
      command: 'serve',
      mode: 'development',
      isSsrBuild: false,
      isPreview: false,
    });

    expect(config.server?.proxy).toHaveProperty('/api');
    expect(config.server?.proxy).not.toHaveProperty('/api/v1');
  });

  it('enables bundled dev for the persistent development lane', async () => {
    expect(typeof viteConfig).toBe('function');
    if (typeof viteConfig !== 'function') return;

    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const config = await viteConfig({
        command: 'serve',
        mode: 'development',
        isSsrBuild: false,
        isPreview: false,
      });

      expect(config.experimental?.bundledDev).toBe(true);
      expect(config.resolve?.alias).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            find: '@memoflow/http-client',
            replacement: expect.stringContaining('/packages/http-client/src/index.ts'),
          }),
          expect.objectContaining({
            find: '@memoflow/utils/shared',
            replacement: expect.stringContaining('/packages/utils/src/shared/index.ts'),
          }),
        ]),
      );
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('allows the configured MagicDNS development host without disabling host checks', async () => {
    expect(typeof viteConfig).toBe('function');
    if (typeof viteConfig !== 'function') return;

    const previousWebUrl = process.env.MEMOFLOW_WEB_URL;
    process.env.MEMOFLOW_WEB_URL = 'https://gcp-dev-01.example.ts.net:20220';
    try {
      const config = await viteConfig({
        command: 'serve',
        mode: 'development',
        isSsrBuild: false,
        isPreview: false,
      });

      expect(config.server?.allowedHosts).toEqual(['gcp-dev-01.example.ts.net']);
      expect(config.server?.strictPort).toBe(true);
    } finally {
      if (previousWebUrl === undefined) delete process.env.MEMOFLOW_WEB_URL;
      else process.env.MEMOFLOW_WEB_URL = previousWebUrl;
    }
  });

  it('guards Tailwind classic hot-update handling in bundled dev', async () => {
    expect(typeof viteConfig).toBe('function');
    if (typeof viteConfig !== 'function') return;

    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const config = await viteConfig({
        command: 'serve',
        mode: 'development',
        isSsrBuild: false,
        isPreview: false,
      });
      const plugin = config.plugins?.find(
        (candidate) =>
          candidate !== null &&
          typeof candidate === 'object' &&
          !Array.isArray(candidate) &&
          'name' in candidate &&
          candidate.name === '@tailwindcss/vite:generate:serve',
      );
      const hotUpdate = plugin && 'hotUpdate' in plugin ? plugin.hotUpdate : undefined;

      expect(typeof hotUpdate).toBe('function');
      if (typeof hotUpdate !== 'function') return;

      const result = hotUpdate.call({} as never, {
        type: 'update',
        file: '/tmp/memoflow-bundled-dev-probe.vue',
        modules: [],
        timestamp: Date.now(),
        read: async () => '',
      } as never);

      expect(result).toBeUndefined();
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('keeps Playwright and test lanes on the classic unbundled server', async () => {
    expect(typeof viteConfig).toBe('function');
    if (typeof viteConfig !== 'function') return;

    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const config = await viteConfig({
        command: 'serve',
        mode: 'development',
        isSsrBuild: false,
        isPreview: false,
      });

      expect(config.experimental?.bundledDev).toBe(false);
      expect(config.resolve?.alias).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ find: '@memoflow/http-client' })]),
      );
      expect(config.resolve?.alias).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ find: '@memoflow/utils/shared' })]),
      );
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
