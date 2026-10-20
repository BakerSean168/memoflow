import { describe, expect, it } from 'vitest';
import {
  antigravityEffortVariant,
  presentAntigravityModels,
} from './antigravity-model-presentation';
import type { ComposerModel } from './useAIModelCatalog';

const variants = (['high', 'medium', 'low'] as const).map((effort) => ({
  key: 'gemini-3.8-flash-' + effort,
  agentKey: 'local:agy',
  agentInstanceId: 'antigravity',
  providerId: 'agy',
  providerName: 'Antigravity',
  modelId: 'gemini-3.8-flash-' + effort,
  modelName: 'Gemini 3.8 Flash (' + effort[0]!.toUpperCase() + effort.slice(1) + ')',
})) satisfies ComposerModel[];
const agents = [{ id: 'local:agy', driver: 'antigravity' as const }];

describe('T3-inspired Antigravity effort presentation', () => {
  it('groups only native-advertised High/Medium/Low while preserving executable model ids', () => {
    const displayed = presentAntigravityModels(
      variants,
      agents,
      'gemini-3.8-flash-medium',
      'local:agy',
    );
    expect(displayed).toHaveLength(1);
    expect(displayed[0]).toMatchObject({
      key: 'gemini-3.8-flash-medium',
      modelId: 'gemini-3.8-flash-medium',
      modelName: 'Gemini 3.8 Flash',
      reasoningEfforts: ['high', 'medium', 'low'],
      defaultReasoningEffort: 'medium',
    });
    expect(antigravityEffortVariant('gemini-3.8-flash-high')).toEqual({
      family: 'gemini-3.8-flash',
      effort: 'high',
    });
  });
  it('does not invent efforts when the official ACP advertises only an unqualified model', () => {
    const bare = [
      {
        ...variants[0]!,
        modelId: 'gemini-3.8-flash',
        key: 'gemini-3.8-flash',
        modelName: 'Gemini 3.8 Flash',
      },
    ];
    expect(presentAntigravityModels(bare, agents, 'gemini-3.8-flash', 'local:agy')).toEqual(bare);
  });
  it('does not fold different agents, other providers or one available effort into unsupported choices', () => {
    const external = {
      ...variants[0]!,
      agentKey: 'agent:mastra',
      modelId: 'gemini-3.8-flash-high',
    };
    expect(
      presentAntigravityModels(
        [variants[0]!, external],
        [...agents, { id: 'agent:mastra', driver: 'mastra' }],
        '',
        '',
      ),
    ).toHaveLength(2);
    expect(
      presentAntigravityModels([variants[0]!], agents, '', 'local:agy')[0]?.reasoningEfforts,
    ).toBeUndefined();
  });
});
