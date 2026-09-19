#!/usr/bin/env node
/**
 * ADR-103 / LABEL-1305 guard: Shared Label time, normalization and color invariants.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const violations = [];
const normalizationFixturePath = 'tools/test/fixtures/label-normalization.json';
try {
  const fixtures = JSON.parse(readFileSync(join(root, normalizationFixturePath), 'utf8'));
  if (!Array.isArray(fixtures) || fixtures.length < 2) {
    violations.push(`${normalizationFixturePath}: expected a non-trivial canonical fixture array`);
  }
} catch (error) {
  violations.push(`${normalizationFixturePath}: invalid or unreadable JSON fixture`);
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'testing') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

for (const file of [
  ...walk(join(root, 'packages/label/src/application')),
  ...walk(join(root, 'packages/label/src/domain')),
]) {
  const source = readFileSync(file, 'utf8');
  if (/Date\.now\s*\(|new Date\s*\(\s*\)/.test(source)) {
    violations.push(`${relative(root, file)}: ambient current time is forbidden`);
  }
}

const service = read('packages/label/src/application/label-service.ts');
if (!/readonly clock:\s*Pick<Clock,\s*['"]now['"]>/.test(service)) {
  violations.push('LabelServiceOptions must require an injected Clock.now seam');
}
if (/readonly now\s*[:?]/.test(service)) {
  violations.push('LabelService must not resurrect a private now() option beside Clock');
}

const contracts = read('packages/contracts/src/modules/label/index.ts');
if (!contracts.includes('export const LabelColorSchema')) {
  violations.push('Shared Label contract must export LabelColorSchema');
}
if (!contracts.includes('/^#[0-9a-fA-F]{6}$/')) {
  violations.push('LabelColorSchema must stay strict six-digit RGB hex');
}
if (
  !contracts.includes('readonly createdAt: Instant') ||
  !contracts.includes('readonly updatedAt: Instant')
) {
  violations.push('LabelDto timestamps must remain Instant');
}

const goalSchema = read('packages/contracts/src/modules/goal/api/response-schemas.ts');
if (!goalSchema.includes('color: LabelColorSchema.nullable()')) {
  violations.push('Goal label projection must reuse LabelColorSchema');
}
const taskSchema = read('packages/contracts/src/modules/task/api/response-schemas.ts');
if (!taskSchema.includes('labels: z.array(LabelClientDTOSchema)')) {
  violations.push('Task label projection must reuse LabelClientDTOSchema');
}

for (const rel of [
  'packages/label/src/infrastructure/prisma/prisma-label.repository.ts',
  'packages/label/src/infrastructure/powersync/powersync-label.repository.ts',
  'packages/goal/src/server/infrastructure/adapters/prisma/goal-prisma.repository.ts',
  'packages/goal/src/server/infrastructure/adapters/powersync/goal-powersync.repository.ts',
  'packages/task/src/server/infrastructure/adapters/prisma/task-plan-prisma.repository.ts',
  'packages/task/src/server/infrastructure/adapters/powersync/task-plan-powersync.repository.ts',
]) {
  if (!read(rel).includes('LabelColorSchema')) {
    violations.push(`${rel}: persisted Label color must be validated through LabelColorSchema`);
  }
}

for (const rel of ['apps/api/src/server.ts', 'apps/desktop/src/main/main.ts']) {
  const source = read(rel);
  const constructions = source.match(/new LabelService\([\s\S]*?\}\s*\)/g) ?? [];
  for (const construction of constructions) {
    if (!construction.includes('clock: createSystemClock()')) {
      violations.push(
        `${rel}: production LabelService construction must inject createSystemClock()`,
      );
    }
  }
}

for (const rel of [
  'packages/label/src/__tests__/label-service.spec.ts',
  'packages/database/src/schema/task-shared-label-migration.spec.ts',
]) {
  if (!read(rel).includes('tools/test/fixtures/label-normalization.json')) {
    violations.push(`${rel}: must consume the canonical Label normalization fixture`);
  }
}

if (violations.length) {
  console.error('[label-primitive-audit] FAIL:');
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

console.log('[label-primitive-audit] OK: Label Clock/Instant/normalization/color invariants hold.');
