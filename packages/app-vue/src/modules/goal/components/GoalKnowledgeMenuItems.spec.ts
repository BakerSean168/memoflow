import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'GoalKnowledgeMenuItems.vue'), 'utf8');
const referenceableSource = readFileSync(
  resolve(__dirname, '../../repository/composables/useReferenceableKnowledgeNotes.ts'),
  'utf8',
);
const webDi = readFileSync(
  resolve(__dirname, '../../../../../../apps/web/src/platform/di-app.ts'),
  'utf8',
);
const desktopDi = readFileSync(
  resolve(__dirname, '../../../../../../apps/desktop/src/renderer/platform/di-app.ts'),
  'utf8',
);

describe('GoalKnowledgeMenuItems stable-reference linking surface', () => {
  it('uses the shared referenceable-note query instead of filtering an arbitrary projection page', () => {
    expect(source).toContain('useReferenceableKnowledgeNotes');
    expect(source).toContain('referenceableKnowledge.load({ query: search, limit: 24 })');
    expect(referenceableSource).toContain('listReferenceableKnowledgeDocuments');
    expect(referenceableSource).toContain('knowledgeSpaceId');
    expect(referenceableSource).not.toContain('referenceableOnly');
  });

  it('uses the typed GoalKnowledge relation seam for link and unlink mutations', () => {
    expect(source).toContain('GoalKnowledgeLinkReqSchema.parse');
    expect(source).toContain('relations.linkGoalKnowledge(request)');
    expect(source).toContain('relations.unlinkGoalKnowledge(request)');
    expect(source).toContain("useStrictInject(GOAL_KNOWLEDGE_SERVICE_KEY, 'GoalKnowledgeService')");
  });

  it('loads authoritative relations separately and debounces server-side candidate search', () => {
    expect(source).toContain('relations.listGoalKnowledge');
    expect(source).toContain('linkedResult.data.map');
    expect(source).toContain('watch(query');
    expect(source).toContain('}, 180);');
  });

  it('provides the relation client on both Web and Desktop hosts', () => {
    expect(webDi).toContain('createGoalKnowledgeHttpClient');
    expect(webDi).toContain('app.provide(GOAL_KNOWLEDGE_SERVICE_KEY, goalKnowledgeService)');
    expect(desktopDi).toContain('createGoalKnowledgeIpcClient');
    expect(desktopDi).toContain(
      'app.provide(GOAL_KNOWLEDGE_SERVICE_KEY, createGoalKnowledgeIpcClient(resultIpcClient))',
    );
  });
});
