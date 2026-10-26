import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/relation-contracts',
  entry: ['src/index.ts'],
  extraOptions: {
    dts: false,
  },
});
