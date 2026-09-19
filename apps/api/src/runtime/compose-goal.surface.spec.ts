import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Goal API runtime composer surface.
 * 目标 API runtime composer 表面契约。
 *
 * Locks the Step 3 wiring: apps/api/src/server.ts must compose goal through the
 * runtime composer and must no longer reference the retired
 * `createGoalApiModule` transport factory or the `@memoflow/goal/api` seam.
 * The composer must only touch the narrow seams the plan allows.
 *
 * 锁定 Step 3 接线：apps/api/src/server.ts 必须通过 runtime composer 组装目标，
 * 且不再引用已退役的 `createGoalApiModule` transport 工厂或 `@memoflow/goal/api`
 * seam。composer 只允许接触计划允许的窄 seam。
 */
describe('goal API runtime composer surface', () => {
  const dir = resolve(__dirname, '..');
  const server = readFileSync(resolve(dir, 'server.ts'), 'utf8');
  const composer = readFileSync(resolve(dir, 'runtime/compose-goal.ts'), 'utf8');

  it('server.ts reuses owner read instances across Goal core, Goal Workspace and Goal Knowledge transports', () => {
    expect(server).toContain("from './runtime/compose-goal'");
    expect(server).toContain(
      'const taskGoalContextReadPort = new PrismaTaskBindingReadPort(prisma);',
    );
    expect(server).toContain('const relationRepository = new PrismaRelationRepository(prisma);');
    expect(server).toContain('const goalKnowledgeService = new GoalKnowledgeService(');
    expect(server).toMatch(/taskBindingReadPort:\s*taskGoalContextReadPort/);
    expect(server).toMatch(/taskContextReadPort:\s*taskGoalContextReadPort/);
    expect(server).toMatch(/knowledgeRelationReadPort:\s*goalKnowledgeService/);
    expect(server).toContain('composeGoalKnowledgeApiModule({ service: goalKnowledgeService })');
    expect(server).toContain('composeGoalWorkspaceApiModule({ port: goalWorkspaceService })');
    expect(server).toContain('.register(goalComposed.module)');
    expect(server).toContain('.register(goalWorkspaceApiModule)');
  });

  it('server.ts no longer references createGoalApiModule or the goal/api seam', () => {
    expect(server).not.toMatch(/\bcreateGoalApiModule\b/);
    expect(server).not.toContain("from '@memoflow/goal/api'");
  });

  it('composer only touches the narrow seams (no CloudAuth, no storage base dir, no deep server import)', () => {
    expect(composer).toContain('interface ComposeGoalDependencies');
    expect(composer).toContain("from '@memoflow/goal'");
    expect(composer).toContain("from '@memoflow/goal/api'");
    expect(composer).not.toContain('CloudAuth');
    expect(composer).not.toContain('repositoryStorageBaseDir');
    expect(composer).not.toMatch(/@memoflow\/goal\/server/);
  });
});
