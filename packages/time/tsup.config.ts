import { baseLibraryConfig, createLocalOnlyDtsPaths } from '../../tools/build/tsup.base.config.ts';

const config = baseLibraryConfig('@memoflow/time');

export default {
  ...config,
  entry: ['src/index.ts'],
  external: [...(config.external || []), '@date-fns/tz', '@memoflow/contracts', 'date-fns', 'rrule'],
  dts: createLocalOnlyDtsPaths(),
};
