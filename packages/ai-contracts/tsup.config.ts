import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';
export default createTsupConfig({
  packageName: '@memoflow/ai-contracts',
  entry: ['src/index.ts', 'src/portable-messages-archive.ts'],
  extraOptions: { dts: false },
});
