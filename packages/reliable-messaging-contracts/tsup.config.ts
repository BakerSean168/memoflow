import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/reliable-messaging-contracts',
  entry: ['src/index.ts'],
  extraOptions: { dts: false },
});
