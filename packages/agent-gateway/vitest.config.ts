import { createPackageVitestConfig } from '../../vitest.shared.ts';
export default createPackageVitestConfig({
  projectRoot: import.meta.dirname,
  environment: 'node',
  name: 'agent-gateway',
  testInclude: ['src/**/*.spec.ts'],
});
