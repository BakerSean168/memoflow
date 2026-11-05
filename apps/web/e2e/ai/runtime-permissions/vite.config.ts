import { defineConfig, mergeConfig } from 'vite';
import path from 'node:path';
import base from '../../task/visual-grammar/vite.config.ts';
import {
  createAiUiAliasEntries,
  createTaskContractsAliasEntries,
  createRepositoryContractsAliasEntries,
} from '../../../../../vite.workspace-aliases.ts';
export default mergeConfig(
  base,
  defineConfig({
    root: import.meta.dirname,
    resolve: {
      alias: [
        {
          find: '@memoflow/ai/testing',
          replacement: path.resolve(
            import.meta.dirname,
            '../../../../../packages/ai/src/testing/runtime-permission-acceptance.ts',
          ),
        },
        ...createAiUiAliasEntries(path.resolve(import.meta.dirname, '../../../../..')),
        ...createTaskContractsAliasEntries(path.resolve(import.meta.dirname, '../../../../..')),
        ...createRepositoryContractsAliasEntries(
          path.resolve(import.meta.dirname, '../../../../..'),
        ),
      ],
    },
    server: {
      host: '127.0.0.1',
      port: 4861,
      strictPort: true,
      fs: { allow: [path.resolve(import.meta.dirname, '../../../../..')] },
    },
    plugins: [
      {
        name: 'isolated-native-runtime',
        configureServer(server) {
          const ready = server
            .ssrLoadModule(path.join(import.meta.dirname, 'runtime.ts'))
            .then((module) => module.createAcceptanceRuntime());
          server.httpServer?.once('close', () => {
            void ready.then((runtime) => runtime.close());
          });
          server.middlewares.use('/__runtime', async (req, res, next) => {
            try {
              const runtime = await ready;
              const url = new URL(req.url ?? '/', 'http://localhost');
              if (url.pathname === '/start') runtime.start(url.searchParams.get('mode'));
              else if (url.pathname === '/approve')
                await runtime.approve(
                  url.searchParams.get('requestId'),
                  url.searchParams.get('runId'),
                );
              else if (url.pathname !== '/state') return next();
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify(runtime.state()));
            } catch (error) {
              res.statusCode = 500;
              res.end(String(error));
            }
          });
        },
      },
    ],
  }),
);
