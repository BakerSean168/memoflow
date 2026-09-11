import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residuals 205/209/211/301: product module indexes, MSW, goal-workflow e2e, and
 * UI redesign docs stay aligned with knowledge-only note surface — no hard-fail
 * CRUD dual-track, no MSW legacy Resource/Folder stubs, no /note/:id runtime,
 * redesign historical sections clearly superseded.
 */
describe('legacy note surface docs and menu dual-track retirement', () => {
  const repoRoot = resolve(__dirname, '../../../../../../');
  const editorIndex = readFileSync(
    resolve(repoRoot, 'docs/product/module-index/editor-files.md'),
    'utf8',
  );
  const repositoryIndex = readFileSync(
    resolve(repoRoot, 'docs/product/module-index/repository-files.md'),
    'utf8',
  );
  const httpAdapterSpec = readFileSync(
    resolve(
      repoRoot,
      'packages/repository/src/infrastructure-client/adapters/http/repository-http.adapter.spec.ts',
    ),
    'utf8',
  );
  // Modular locale tree — menu module is the bookmark dual-track surface under test.
  const enLocale = readFileSync(
    resolve(repoRoot, 'packages/app-vue/src/locales/en-US/menu.ts'),
    'utf8',
  );
  const zhLocale = readFileSync(
    resolve(repoRoot, 'packages/app-vue/src/locales/zh-CN/menu.ts'),
    'utf8',
  );
  const mswHandlers = readFileSync(
    resolve(repoRoot, 'apps/web/src/mocks/handlers/repository.handlers.ts'),
    'utf8',
  );
  const goalWorkflowE2e = readFileSync(
    resolve(repoRoot, 'apps/web/e2e/ai/goal-workflow.spec.ts'),
    'utf8',
  );
  const redesignBrief = readFileSync(resolve(repoRoot, 'docs/UI_REDESIGN_BRIEF.md'), 'utf8');
  const pageRedesignPlan = readFileSync(resolve(repoRoot, 'docs/UI_PAGE_REDESIGN_PLAN.md'), 'utf8');
  const repositoryRouter = readFileSync(
    resolve(repoRoot, 'packages/app-vue/src/modules/repository/router/index.ts'),
    'utf8',
  );

  it('module indexes no longer claim hard-fail NOT_SUPPORTED CRUD stubs', () => {
    expect(editorIndex).not.toMatch(/硬失败\s*`?NOT_SUPPORTED`?/);
    expect(repositoryIndex).not.toMatch(/硬失败\s*`?NOT_SUPPORTED`?/);
    expect(editorIndex).toContain('无 legacy CRUD 方法');
    expect(repositoryIndex).toContain('无 legacy CRUD 方法');
    expect(repositoryIndex).not.toContain('legacy 硬失败');
    expect(repositoryIndex).not.toContain('legacy 404');
    expect(httpAdapterSpec).toContain('does not keep hard-fail stubs for retired CRUD methods');
  });

  it('indexes point at the controlled create/adoption surface lock (residual 201)', () => {
    expect(editorIndex).toContain('controlled-note-write-boundary.surface.spec.ts');
    expect(repositoryIndex).toContain('controlled-note-write-boundary.surface.spec.ts');
  });

  it('MSW handlers stay knowledge-only without legacy Resource dual-track stubs', () => {
    expect(mswHandlers).toContain('knowledge-connections');
    expect(mswHandlers).toContain('knowledge-notes');
    expect(mswHandlers).not.toContain('Legacy repository route is not mounted');
    expect(mswHandlers).not.toMatch(/\/resources/);
    expect(repositoryIndex).toContain('MSW knowledge-only');
  });

  it('goal workflow e2e does not seed legacy-goal-workflow debug dual-track', () => {
    expect(goalWorkflowE2e).not.toMatch(/legacyGoalWorkflow\?:/);
    expect(goalWorkflowE2e).toContain(
      "legacyGoalWorkflowStorageKey: 'ai:debug:legacy-goal-workflow'",
    );
    expect(goalWorkflowE2e).toContain(
      'window.localStorage.removeItem(legacyGoalWorkflowStorageKey)',
    );
    expect(goalWorkflowE2e).not.toContain('setItem(legacyGoalWorkflowStorageKey');
  });

  it('menu locales drop repository bookmark dual-track keys and keep live template pause/enable', () => {
    for (const locale of [enLocale, zhLocale]) {
      // Match legacy `key: '…'` and modular `"key": "…"` forms.
      expect(locale).not.toMatch(/["']?addBookmark["']?\s*:/);
      expect(locale).not.toMatch(/["']?removeBookmark["']?\s*:/);
      expect(locale).not.toMatch(/["']bookmark["']\s*:/);
      expect(locale).toMatch(/["']?pauseTemplate["']?\s*:/);
      expect(locale).toMatch(/["']?enableTemplate["']?\s*:/);
    }
  });

  it('UI redesign docs supersede retired note editor runtime (residual 301)', () => {
    expect(redesignBrief).toContain('知识模块现状 supersede');
    expect(redesignBrief).toContain('openRecentKnowledgeNote');
    expect(redesignBrief).toContain('/repository?note=');
    expect(redesignBrief).toContain('历史快照');
    expect(redesignBrief).toContain('RepositoryEntryView');
    expect(redesignBrief).toContain('KnowledgeProjectionWorkspaceView');
    // DI key remains for knowledge RepositoryClientPort; do not call it retired.
    expect(redesignBrief).toContain('REPOSITORY_SERVICE_KEY');
    expect(redesignBrief).toContain('RepositoryClientPort');
    expect(redesignBrief).not.toMatch(/REPOSITORY_SERVICE_KEY` 旧仓储 DI 端口/);

    expect(pageRedesignPlan).toContain('RepositoryWorkspaceView.vue');
    expect(pageRedesignPlan).toContain('历史方案（已 supersede）');
    expect(pageRedesignPlan).toContain('KnowledgeProjectionWorkspaceView');
    expect(pageRedesignPlan).toContain('LocalVaultWorkspaceView');
    expect(pageRedesignPlan).toContain('/repository?note=');

    expect(repositoryRouter).toContain("path: '/repository'");
    expect(repositoryRouter).toContain('RepositoryEntryView');
    expect(repositoryRouter).not.toContain('RepositoryWorkspaceView');
    expect(repositoryRouter).not.toContain("path: '/note");
  });
});
