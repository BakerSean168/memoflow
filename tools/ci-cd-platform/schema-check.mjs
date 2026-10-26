#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('tools/ci-cd-platform/schemas');
const expected = [
  'delivery-manifest-v1.schema.json',
  'ci-dispatch-v2.schema.json',
  'ci-task-receipt-v1.schema.json',
  'ci-evidence-v1.schema.json',
  'ci-chain-v1.schema.json',
  'lane-input-v1.schema.json',
  'lane-result-v1.schema.json',
  'artifact-manifest-v1.schema.json',
  'promotion-manifest-v1.schema.json',
  'lane-registry-v1.schema.json',
  'workspace-receipt-v1.schema.json',
  'lane-summary-v1.schema.json',
  'run-summary-v1.schema.json',
  'timing-report-v1.schema.json',
  'fault-injection-report-v1.schema.json',
  'quality-shadow-sample-v1.schema.json',
  'quality-shadow-report-v1.schema.json',
  'macos-trust-receipt-v1.schema.json',
];
for (const file of expected) {
  const schema = JSON.parse(await readFile(path.join(root, file), 'utf8'));
  if (!schema.$id || !schema.$schema || schema.type !== 'object')
    throw new Error(`invalid contract schema: ${file}`);
  if (!Array.isArray(schema.required) || schema.required.length === 0)
    throw new Error(`schema has no required fields: ${file}`);
}
console.log(`[ci-cd-schema] ${expected.length} versioned contract schemas valid`);
