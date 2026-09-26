import { createPackageVitestConfig } from '../../vitest.shared.ts';

export default createPackageVitestConfig({
  projectRoot: import.meta.dirname,
  environment: 'node',
  name: 'cloud-auth',
  testInclude: ['src/**/*.spec.ts'],
});
