import { baseLibraryConfig, createLocalOnlyDtsPaths } from '../../tools/build/tsup.base.config.ts';
const config = baseLibraryConfig('@memoflow/relation');
export default {
  ...config,
  entry: ['src/index.ts', 'src/client/index.ts'],
  tsconfig: 'tsconfig.build.json',
  dts: createLocalOnlyDtsPaths(),
};
