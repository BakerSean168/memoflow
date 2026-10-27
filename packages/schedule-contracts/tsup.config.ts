/**
 * @memoflow/schedule-contracts 打包配置
 *
 * 包类型：Schedule 领域契约（DTO、Schema、值对象、事件、协议），
 * 真身自 @memoflow/contracts/modules/schedule 迁入（Issue #630 §4.4）。
 */

import { createTsupConfig } from '../../tools/build/tsup.base.config.ts';

export default createTsupConfig({
  packageName: '@memoflow/schedule-contracts',
  entry: ['src/index.ts'],
  extraOptions: {
    dts: false,
  },
});
