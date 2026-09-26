/// <reference types="vitest" />
import path from 'node:path';
import { createPackageVitestConfig } from '../../vitest.shared.ts';

const workspaceRoot = path.resolve(import.meta.dirname, '../..');
const contractsRoot = path.resolve(workspaceRoot, 'packages/contracts/src');

export default createPackageVitestConfig({
  projectRoot: import.meta.dirname,
  environment: 'node',
  name: 'setting',
  governedCoverage: true,
  aliasEntries: [
    {
      find: /^@\/primitives(.*)/,
      replacement: path.join(contractsRoot, 'primitives$1'),
    },
  ],
});
