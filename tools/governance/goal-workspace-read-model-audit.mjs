#!/usr/bin/env node
/**
 * ADR-069 / GOAL-7207 Goal Workspace read-model ownership audit.
 *
 * Locks the read-side architecture:
 * - Goal/KR stays authoritative in Goal; Workspace never stores taskIds/noteIds.
 * - Goal Workspace composes external context through structural consumer ports only.
 * - Task/Knowledge/Relation concrete persistence remains host-owned.
 * - Goal Knowledge pagination is pushed into Relation persistence, not sliced after a full scan.
 * - HTTP/IPC and React/Vue clients expose the same read operations.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

requireTokens('packages/contracts/src/modules/goal/api/goal-workspace.dto.ts', [
  'GoalWorkspaceReadModelSchema',
  'taskContext:',
  'knowledgeContext:',
  'recentProgress:',
  'recentReviews:',
  'GoalWorkspaceTaskPageInvocationSchema',
  'GoalWorkspaceKnowledgePageInvocationSchema',
]);
forbidPatterns('packages/contracts/src/modules/goal/api/goal-workspace.dto.ts', [
  [/\btaskIds\b/, 'Workspace contract must not copy Task ids into Goal authority'],
  [/\bnoteIds\b/, 'Workspace contract must not copy Knowledge ids into Goal authority'],
  [/^\s*keyResults:\s/m, 'Workspace must not duplicate goal.keyResults at the top level'],
]);
forbidPatterns('packages/contracts/src/modules/goal/api/response-schemas.ts', [
  [/\btaskIds\b/, 'GoalClientDTO must not own Task ids'],
  [/\bnoteIds\b/, 'GoalClientDTO must not own Knowledge ids'],
]);

requireTokens('packages/goal/src/server/application/ports/goal-workspace-read.ports.ts', [
  'GoalWorkspaceTaskContextReadPort',
  'GoalWorkspaceKnowledgeRelationReadPort',
  'GoalWorkspaceKnowledgeContextReadPort',
]);
forbidPatterns('packages/goal/src/server/application/ports/goal-workspace-read.ports.ts', [
  [
    /@memoflow\/task(?:\/[^'"`]*)?['"`]/,
    'consumer port must not import Task implementation package',
  ],
  [
    /@memoflow\/relation(?:\/[^'"`]*)?['"`]/,
    'consumer port must not import Relation implementation package',
  ],
  [
    /@memoflow\/repository(?:\/[^'"`]*)?['"`]/,
    'consumer port must not import Repository implementation package',
  ],
]);

requireTokens('packages/goal/src/server/application/services/goal-workspace-query.service.ts', [
  'implements GoalWorkspaceApplicationPort',
  'taskContextReadPort',
  'knowledgeRelationReadPort',
  'knowledgeContextReadPort',
  'findByIdForIdentity',
  'ListGoalRecordsUseCase',
  "availability: 'Unavailable'",
  "state: 'Missing'",
]);
forbidPatterns('packages/goal/src/server/application/services/goal-workspace-query.service.ts', [
  [
    /@memoflow\/task(?:\/[^'"`]*)?['"`]/,
    'Workspace service must not import Task owner implementation',
  ],
  [
    /@memoflow\/relation(?:\/[^'"`]*)?['"`]/,
    'Workspace service must not import Relation owner implementation',
  ],
  [
    /@memoflow\/repository(?:\/[^'"`]*)?['"`]/,
    'Workspace service must not import Repository owner implementation',
  ],
  [/\bPrisma\w*/, 'Workspace service must not query Prisma directly'],
  [/\bPowerSync\w*/, 'Workspace service must not query PowerSync directly'],
]);

requireTokens('packages/relation/src/application/goal-knowledge-service.ts', [
  'listEdgeRefsForGoal',
  'findPageBySubject',
  "relationType: 'related'",
  "objectType: 'note'",
]);
requireTokens('packages/relation/src/infrastructure/prisma/prisma-relation.repository.ts', [
  'async findPageBySubject',
  'take: query.limit',
  'skip: query.offset',
  'this.db.relation.count({ where })',
]);
requireTokens('packages/relation/src/infrastructure/powersync/powersync-relation.repository.ts', [
  'async findPageBySubject',
  'LIMIT ? OFFSET ?',
  'SELECT COUNT(*) as count FROM relations',
]);

requireTokens('apps/api/src/server.ts', [
  'const taskGoalContextReadPort = new PrismaTaskBindingReadPort(prisma)',
  'taskBindingReadPort: taskGoalContextReadPort',
  'taskContextReadPort: taskGoalContextReadPort',
  'const goalKnowledgeService = new GoalKnowledgeService(',
  'knowledgeRelationReadPort: goalKnowledgeService',
  'composeGoalKnowledgeApiModule({ service: goalKnowledgeService })',
  'new GoalWorkspaceQueryService({',
  'composeGoalWorkspaceApiModule({ port: goalWorkspaceService })',
]);
requireTokens('apps/desktop/src/main/main.ts', [
  'const taskGoalContextReadPort = new PowerSyncTaskBindingReadPort(db)',
  'taskBindingReadPort: taskGoalContextReadPort',
  'taskContextReadPort: taskGoalContextReadPort',
  'const goalKnowledgeService = new GoalKnowledgeService(',
  'knowledgeRelationReadPort: goalKnowledgeService',
  'service: goalKnowledgeService',
  'new GoalWorkspaceQueryService({',
  'createGoalWorkspaceElectronModule({',
]);

requireTokens('apps/api/src/modules/goal/goal-workspace.module.ts', [
  "router.get('/:goalId/workspace'",
  "router.get('/:goalId/workspace/tasks'",
  "router.get('/:goalId/workspace/knowledge'",
]);
requireTokens('apps/desktop/src/main/modules/goal/goal-workspace.electron-module.ts', [
  'GoalWorkspaceChannels.GET',
  'GoalWorkspaceChannels.TASKS',
  'GoalWorkspaceChannels.KNOWLEDGE',
]);
requireTokens('packages/contracts/src/electron/ipc-channels.ts', [
  "GET: 'goal:workspace:get'",
  "TASKS: 'goal:workspace:tasks'",
  "KNOWLEDGE: 'goal:workspace:knowledge'",
]);

for (const clientPath of [
  'packages/goal/src/infrastructure-client/adapters/http/goal-http.adapter.ts',
  'packages/goal/src/infrastructure-client/adapters/ipc/goal-ipc.adapter.ts',
]) {
  requireTokens(clientPath, [
    'getGoalWorkspace(',
    'getGoalWorkspaceTasks(',
    'getGoalWorkspaceKnowledge(',
  ]);
}
requireTokens('packages/app-vue/src/modules/goal/composables/useGoalWorkspace.ts', [
  'service.getGoalWorkspace(',
  'service.getGoalWorkspaceTasks(',
  'service.getGoalWorkspaceKnowledge(',
]);
requireTokens('packages/app-react/src/hooks/useGoalWorkspace.ts', [
  'service.getGoalWorkspace(',
  'service.getGoalWorkspaceTasks(',
  'service.getGoalWorkspaceKnowledge(',
]);

if (violations.length > 0) {
  console.error(`[goal-workspace-read-model-audit] FAIL: ${violations.length} issue(s)`);
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error(
    'Fix: keep Goal Workspace read-only, owner-port composed, persistence-bounded, and transport/client-parity complete.',
  );
  process.exit(1);
}

console.log(
  '[goal-workspace-read-model-audit] OK: Goal authority, owner-port composition, bounded context queries, and client parity are locked.',
);
