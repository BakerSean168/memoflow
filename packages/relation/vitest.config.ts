/// <reference types="vitest" />
import { createPackageVitestConfig } from '../../vitest.shared';
export default createPackageVitestConfig({
  projectRoot: __dirname,
  environment: 'node',
  name: 'relation',
});
