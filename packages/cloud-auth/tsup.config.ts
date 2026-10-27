import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/server/index.ts', 'src/client/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: [
    '@memoflow/database',
    '@memoflow/cloud-auth-contracts',
    '@memoflow/agent-gateway',
    '@memoflow/http-client',
    '@memoflow/ipc-client',
    'better-auth',
    '@better-auth/prisma-adapter',
    '@better-auth/mcp',
    '@better-auth/cimd',
    '@better-auth/oauth-provider',
    'express',
  ],
});
