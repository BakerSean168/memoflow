import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('AI provider template catalog after GOAL-7210', () => {
  const dir = __dirname;
  const ai = readFileSync(resolve(dir, 'ai-provider-template.ts'), 'utf8');
  const retiredGoalCatalog = resolve(
    dir,
    '../../../../../goal/src/application-client/goal-templates.ts',
  );

  it('keeps provider template lookup provider-owned', () => {
    expect(ai).toMatch(/export function getTemplateById\b/);
    expect(ai).toContain('AIProviderTemplate');
    expect(ai).toContain('AI_PROVIDER_TEMPLATES');
    const body = ai.match(/export function getTemplateById\([\s\S]*?\n\}/)?.[0] ?? '';
    expect(body).toContain('AI_PROVIDER_TEMPLATES.find');
    expect(body).not.toContain('GoalTemplate');
  });

  it('does not preserve the retired parallel GoalTemplate OKR catalog', () => {
    expect(existsSync(retiredGoalCatalog)).toBe(false);
    expect(ai).not.toContain('BUILT_IN_TEMPLATES');
    expect(ai).not.toContain('goal getTemplateById');
  });
});
