#!/usr/bin/env node
/**
 * ADR-069 / ADR-090 / GOAL-7206 Shared Relation ownership audit.
 *
 * Locks the destructive cutover:
 * - Relation is a shared capability, never Goal-owned persistence/use cases.
 * - durable Note relation identity is KnowledgeDocumentId, never path/projection id.
 * - Prisma and PowerSync lanes remain present and PowerSync upload stays validated.
 * - Goal deletion uses a same-database transaction with an injected Relation cleanup port.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const violations = [];

function read(relativePath) {
  const file = join(root, relativePath);
  if (!existsSync(file)) {
    violations.push(`${relativePath}: missing canonical file`);
    return '';
  }
  return readFileSync(file, 'utf8');
}

function requireTokens(relativePath, tokens) {
  const source = read(relativePath);
  for (const token of tokens) {
    if (!source.includes(token)) violations.push(`${relativePath}: missing ${token}`);
  }
}

function forbidPatterns(relativePath, patterns) {
  const source = read(relativePath);
  for (const [pattern, description] of patterns) {
    if (pattern.test(source)) violations.push(`${relativePath}: ${description}`);
  }
}

function productionTypeScriptFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__')
      continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) productionTypeScriptFiles(full, out);
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:spec|test)\.(?:ts|tsx)$/.test(entry.name))
      out.push(full);
  }
  return out;
}

const goalRoot = join(root, 'packages/goal/src');
const retiredGoalOwnership = [
  [/\bIRelationRepository\b/, 'Goal must not own IRelationRepository'],
  [/\bCreateRelationUseCase\b/, 'Goal must not own CreateRelationUseCase'],
  [/\bListRelationsUseCase\b/, 'Goal must not own ListRelationsUseCase'],
  [/\bRelationPrismaRepository\b/, 'Goal must not own RelationPrismaRepository'],
  [/\bPrismaRelationMapper\b/, 'Goal must not own PrismaRelationMapper'],
  [/['"`]relation\.create['"`]/, 'Goal manifest must not own relation.create'],
  [
    /@memoflow\/relation(?:\/[^'"`]*)?['"`]/,
    'Goal package must not import Shared Relation directly',
  ],
];
for (const file of productionTypeScriptFiles(goalRoot)) {
  const source = readFileSync(file, 'utf8');
  for (const [pattern, description] of retiredGoalOwnership) {
    if (pattern.test(source)) violations.push(`${relative(root, file)}: ${description}`);
  }
}

const goalPackage = JSON.parse(read('packages/goal/package.json') || '{}');
if (
  goalPackage.dependencies?.['@memoflow/relation'] ||
  goalPackage.devDependencies?.['@memoflow/relation']
) {
  violations.push('packages/goal/package.json: Goal must not depend on @memoflow/relation');
}

for (const retiredPath of [
  'packages/goal/src/server/domain/repositories/i-relation-repository.ts',
  'packages/goal/src/server/application/use-cases/commands/relation.use-cases.ts',
  'packages/goal/src/server/infrastructure/adapters/prisma/relation-prisma.repository.ts',
  'packages/goal/src/server/infrastructure/adapters/prisma/mappers/prisma-relation.mapper.ts',
]) {
  if (existsSync(join(root, retiredPath)))
    violations.push(`${retiredPath}: retired Goal-owned Relation path resurrected`);
}

requireTokens('packages/contracts/src/modules/relation/index.ts', [
  "z.object({ type: z.literal('note'), id: KnowledgeDocumentIdSchema }).strict()",
  'KnowledgeDocumentRefSchema',
  'GoalKnowledgeLinkReqSchema',
  'GoalsForKnowledgeReqSchema',
]);
forbidPatterns('packages/contracts/src/modules/relation/index.ts', [
  [
    /\bKnowledgeNoteProjection(?:Id)?\b/,
    'Relation contract must not use path-derived Knowledge projection identity',
  ],
  [/\brelativePath\b/, 'Relation contract must not persist a relative path'],
]);

requireTokens('packages/relation/src/infrastructure/prisma/prisma-relation.repository.ts', [
  'implements RelationRepository',
  'deleteAllForEntity',
  'identityId',
]);
requireTokens('packages/relation/src/infrastructure/powersync/powersync-relation.repository.ts', [
  'implements RelationRepository',
  'INSERT INTO relations',
  'deleteAllForEntity',
  'identity_id',
]);
requireTokens('packages/relation/src/application/goal-knowledge-service.ts', [
  'GoalKnowledgeService',
  'KnowledgeDocumentRefResolver',
  "relationType: 'related'",
]);
requireTokens('packages/relation/src/client/index.ts', [
  'GoalKnowledgeClientPort',
  'linkGoalKnowledge',
  'unlinkGoalKnowledge',
  'listGoalKnowledge',
  'listGoalsForKnowledge',
]);
for (const file of productionTypeScriptFiles(join(root, 'packages/relation/src'))) {
  const source = readFileSync(file, 'utf8');
  if (/\b(?:relativePath|KnowledgeNoteProjectionId|projectionId)\b/.test(source)) {
    violations.push(
      `${relative(root, file)}: Shared Relation must not persist path/projection identity`,
    );
  }
}

requireTokens('packages/powersync-schema/src/index.ts', [
  'const relations = new Table({',
  'identity_id: column.text',
  'subject_id: column.text',
  'object_id: column.text',
  'relations,',
]);
requireTokens('docker/powersync/sync-config.yaml', [
  'SELECT * FROM relations WHERE identity_id = auth.user_id()',
]);
requireTokens('apps/api/src/modules/powersync/table-mapping.ts', [
  "'relations'",
  "relations: 'relation'",
]);
requireTokens('apps/api/src/modules/powersync/relation-crud-executor.ts', [
  'CreateRelationReqSchema.parse',
  "operation.op === 'PATCH'",
  'Relation PATCH is not supported; use DELETE + PUT',
  'where: { id: operation.id, identityId }',
]);

requireTokens(
  'packages/goal/src/server/infrastructure/adapters/prisma/prisma-goal-deletion-transaction-runner.ts',
  ['this.prisma.$transaction', 'relationCleanup: this.relationCleanupFactory(tx)'],
);
requireTokens(
  'packages/goal/src/server/infrastructure/adapters/powersync/powersync-goal-deletion-transaction-runner.ts',
  ['this.db.writeTransaction', 'relationCleanup: this.relationCleanupFactory(tx)'],
);
requireTokens('packages/goal/src/server/application/use-cases/commands/delete-goal.use-case.ts', [
  'this.deletionTransactionRunner.run',
  'relationCleanup.unlinkAllForGoal(identityId, id)',
]);
requireTokens(
  'packages/goal/src/server/application/use-cases/commands/permanently-delete-goal.use-case.ts',
  ['this.deletionTransactionRunner.run', 'relationCleanup.unlinkAllForGoal(identityId, id)'],
);
requireTokens('packages/goal/src/server/infrastructure/prisma.ts', [
  'relationCleanupFactory: PrismaGoalRelationCleanupFactory',
  'createGoalPrismaDeletionTransactionRunner',
]);
requireTokens('packages/goal/src/server/infrastructure/powersync.ts', [
  'relationCleanupFactory: PowerSyncGoalRelationCleanupFactory',
  'createGoalPowerSyncDeletionTransactionRunner',
]);

for (const hostPackagePath of ['apps/api/package.json', 'apps/desktop/package.json']) {
  const pkg = JSON.parse(read(hostPackagePath) || '{}');
  if (pkg.dependencies?.['@memoflow/relation'] !== 'workspace:*') {
    violations.push(`${hostPackagePath}: host must compose @memoflow/relation explicitly`);
  }
}

if (violations.length > 0) {
  console.error(`[shared-relation-ownership-audit] FAIL: ${violations.length} issue(s)`);
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error(
    'Fix: keep Relation shared, stable-kdoc based, persistence-parity complete, and injected into atomic Goal deletion.',
  );
  process.exit(1);
}

console.log(
  '[shared-relation-ownership-audit] OK: Shared Relation ownership, stable identity, PowerSync parity, and atomic Goal cleanup are locked.',
);
