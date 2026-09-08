import { defineConfig } from 'tsup';
import { createLocalOnlyDtsPaths } from '../../tools/build/tsup.base.config.ts';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/scheduler/index.ts',
    'src/repository/index.ts',
    'src/cache/index.ts',
    'src/events/index.ts',
    'src/operations/index.ts',
    'src/lease/index.ts',
  ],
  format: ['esm'],
  dts: createLocalOnlyDtsPaths(),
  clean: true,
  sourcemap: true,
});
