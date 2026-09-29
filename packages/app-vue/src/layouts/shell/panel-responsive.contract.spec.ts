/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

describe('split workspace responsive contract', () => {
  it('gives AI and business content independent named containers', () => {
    expect(source('../../modules/ai/views/AIChatView.vue')).toContain('@container/ai');
    expect(source('./BusinessPanel.vue')).toContain('@container/panel');
  });

  it('uses AI-container breakpoints for narrow workflow grids', () => {
    for (const path of [
      '../../modules/ai/components/AIGoalDraftEditor.vue',
      '../../modules/ai/components/AIGoalWorkflowPanel.vue',
      '../../modules/ai/components/AIMessagePanel.vue',
    ]) {
      const content = source(path);
      expect(content).toMatch(/@(?:sm|md|lg|xl)\/ai:/);
      expect(content).not.toMatch(/\b(?:sm|md|lg|xl):grid-cols-/);
    }
  });

  it('uses business-panel breakpoints for embedded Goal and Repository grids', () => {
    for (const path of [
      '../../modules/goal/components/weight/WeightSuggestionPanel.vue',
      '../../modules/goal/components/weight-snapshot/WeightComparison.vue',
      '../../modules/repository/components/KnowledgeProjectionRelationsView.vue',
    ]) {
      expect(source(path)).toMatch(/@(?:sm|md|lg|xl)\/panel:/);
    }
  });
});
