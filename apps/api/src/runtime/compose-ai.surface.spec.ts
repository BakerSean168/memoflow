import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AI API runtime composer surface.
 * AI API runtime composer 表面契约。
 *
 * Locks the Step B cutover: apps/api/src/server.ts must compose AI through the
 * local runtime composer, must no longer reference the retired
 * `createAIApiModule` / `AIApiModuleContext` transport composition or the
 * `@memoflow/ai/api` seam, and must keep the AI registration position between
 * Task and Goal. Only the composer may import the package `/api` seam; no app
 * code may deep-import `@memoflow/ai/server`. The package AI transport
 * (`packages/ai/src/api/module.ts`) must stay free of PrismaClient, config
 * reads and concrete adapter construction.
 *
 * 锁定 Step B 切换：apps/api/src/server.ts 必须通过本地 runtime composer 组装 AI，
 * 不再引用已退役的 `createAIApiModule` / `AIApiModuleContext` transport 组合或
 * `@memoflow/ai/api` seam，并保持 AI 注册位置位于 Task 与 Goal 之间。只有
 * composer 允许导入 package `/api` seam；app 代码不得 deep-import
 * `@memoflow/ai/server`。package AI transport（`packages/ai/src/api/module.ts`）
 * 必须不含 PrismaClient、config 读取与 concrete adapter 构造。
 */
describe('AI API runtime composer surface', () => {
  const apiDir = resolve(__dirname, '..');
  const aiPackageApiModule = resolve(apiDir, '../../../packages/ai/src/api/module.ts');
  const server = readFileSync(resolve(apiDir, 'server.ts'), 'utf8');
  const composer = readFileSync(resolve(apiDir, 'runtime/compose-ai.ts'), 'utf8');
  const transportModule = readFileSync(aiPackageApiModule, 'utf8');

  it('server.ts composes AI with owner-domain mutation ports plus read-only Planner/Notification capabilities', () => {
    expect(server).toContain("from './runtime/compose-ai'");
    expect(server).toMatch(
      /composeAI\(\{\s*db: prisma,\s*repositoryApiPort: repositoryApiModule\.getApplicationPort\(\),\s*repositoryStorageBaseDir,\s*goalApplicationPort: goalComposed\.applicationPort,\s*taskApplicationPort: taskComposed\.applicationPort,\s*reminderApplicationPort: reminderComposed\.executorReminderPort,\s*routineCommandPort: reminderComposed\.routineCommandPort,\s*scheduleRepository: scheduleApiModule\.repositories\.scheduleRepository,\s*notificationRepository: notificationApiModule\.repositories\.notificationRepository,\s*userTimeContextPort: settingApiModule\.userTimeContextPort,\s*labelService,\s*mastraStorage: \{ kind: 'postgres', connectionString: env\.DATABASE_URL \},\s*\}/,
    );
    expect(server).toContain('.register(aiApiModule)');
    expect(server).toContain('routineCommandPort: reminderComposed.routineCommandPort');
    expect(server).toContain('scheduleRepository: scheduleApiModule.repositories.scheduleRepository');
    expect(server).toContain('notificationRepository: notificationApiModule.repositories.notificationRepository');
    expect(server).not.toContain('schedulerRepository:');
  });

  it('keeps the AI registration between Task and Goal (taskComposed.module → aiApiModule → goalComposed.module)', () => {
    const taskIndex = server.indexOf('.register(taskComposed.module)');
    const aiIndex = server.indexOf('.register(aiApiModule)');
    const goalIndex = server.indexOf('.register(goalComposed.module)');
    expect(taskIndex).toBeGreaterThan(-1);
    expect(aiIndex).toBeGreaterThan(-1);
    expect(goalIndex).toBeGreaterThan(-1);
    expect(taskIndex).toBeLessThan(aiIndex);
    expect(aiIndex).toBeLessThan(goalIndex);
  });

  it('server.ts feeds the composed goal/task/reminder application ports into composeAI and registers their .module handles', () => {
    expect(server).toContain('goalComposed.applicationPort');
    expect(server).toContain('taskComposed.applicationPort');
    expect(server).toContain('reminderComposed.executorReminderPort');
    expect(server).toContain('.register(taskComposed.module)');
    expect(server).toContain('.register(goalComposed.module)');
    expect(server).not.toMatch(/create(Goal|Task|Reminder)PrismaModule/);
  });

  it('server.ts no longer names createAIApiModule/AIApiModuleContext or imports the ai/api seam', () => {
    expect(server).not.toMatch(/\bcreateAIApiModule\b/);
    expect(server).not.toMatch(/\bAIApiModuleContext\b/);
    expect(server).not.toContain("from '@memoflow/ai/api'");
  });

  it('only the local composer imports the package /api seam in apps/api', () => {
    const matches: string[] = [];
    collectFilesWithImport(apiDir, "from '@memoflow/ai/api'", matches);
    expect(matches).toEqual(['runtime/compose-ai.ts']);
  });

  it('no app code deep-imports @memoflow/ai/server', () => {
    const matches: string[] = [];
    collectFilesWithImport(apiDir, '@memoflow/ai/server', matches);
    expect(matches).toEqual([]);
  });

  it('composer imports only the package root and /api seams (no deep /server import)', () => {
    expect(composer).toContain('interface ComposeAIDependencies');
    expect(composer).toContain("from '@memoflow/ai'");
    expect(composer).toContain("from '@memoflow/ai/api'");
    expect(composer).not.toMatch(/@memoflow\/ai\/server/);
  });

  it('AI transport module.ts stays DB-free: no PrismaClient, no config, no concrete adapter construction', () => {
    const forbidden = [
      'PrismaClient',
      'context.db',
      'getAIServiceRuntimeConfig',
      'AIConversationPrismaRepository',
      'AIProviderConfigPrismaRepository',
      'AIKnowledgeIndexPrismaRepository',
      'AIExecutionLogPrismaAdapter',
      'AgentCheckpointPrismaAdapter',
      'LangGraphCheckpointPrismaAdapter',
      'AIEvaluationReportFileAdapter',
      /AIService[A-Za-z]+Adapter/,
    ];
    for (const pattern of forbidden) {
      if (pattern instanceof RegExp) {
        expect(transportModule).not.toMatch(pattern);
      } else {
        expect(transportModule).not.toContain(pattern);
      }
    }
  });

  it('AI transport module.ts keeps the seven Mastra-native relative mounts in order', () => {
    const mounts = [
      "router.use('/ai/providers', providerRoutes);",
      "router.use('/ai', capabilityRoutes);",
      "router.use('/ai/chat', chatRoutes);",
      "router.use('/ai/runtime', runtimeRoutes);",
      "router.use('/ai/knowledge', knowledgeQueryRoutes);",
      "router.use('/ai/analytics', analyticsQueryRoutes);",
      "router.use('/ai', evaluationReportRoutes);",
    ];
    let cursor = 0;
    for (const mount of mounts) {
      const index = transportModule.indexOf(mount, cursor);
      expect(index).toBeGreaterThan(-1);
      cursor = index + mount.length;
    }
  });
});

function collectFilesWithImport(
  dir: string,
  needle: string,
  matches: string[],
  rootDir: string = dir,
): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFilesWithImport(full, needle, matches, rootDir);
    } else if (
      full.endsWith('.ts') &&
      !full.endsWith('.d.ts') &&
      !full.includes('.spec.') &&
      !full.includes('.test.')
    ) {
      const content = readFileSync(full, 'utf8');
      if (content.includes(needle)) {
        matches.push(full.slice(rootDir.length + 1).replaceAll('\\', '/'));
      }
    }
  }
}
