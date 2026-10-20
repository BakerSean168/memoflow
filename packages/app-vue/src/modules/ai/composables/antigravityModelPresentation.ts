import type { AgentDriverKind } from '@memoflow/contracts/ai';
import type { ComposerModel } from './useAIModelCatalog';

export interface PickerAgentIdentity {
  id: string;
  driver: AgentDriverKind;
}

/** ACP publishes independent executable slugs, not a generic reasoning API.
 * Fold only variants that the native session ACTUALLY advertises into one UI
 * row. Selection still routes to the exact official slug; no synthetic model
 * is sent to ACP. */
export function antigravityEffortVariant(modelId: string): {
  family: string;
  effort: 'high' | 'medium' | 'low';
} | null {
  const match = /^(gemini-[a-z0-9.-]+)-(high|medium|low)$/iu.exec(modelId);
  if (!match?.[1] || !match[2]) return null;
  return {
    family: match[1],
    effort: match[2].toLowerCase() as 'high' | 'medium' | 'low',
  };
}

export function presentAntigravityModels(
  models: readonly ComposerModel[],
  agents: readonly PickerAgentIdentity[],
  selectedModelId: string,
  selectedAgentKey: string,
): ComposerModel[] {
  const agyKeys = new Set(
    agents.filter((entry) => entry.driver === 'antigravity').map((x) => x.id),
  );
  const families = new Map<string, ComposerModel[]>();
  for (const model of models) {
    if (!agyKeys.has(model.agentKey)) continue;
    const variant = antigravityEffortVariant(model.modelId);
    if (!variant) continue;
    const key = model.agentKey + '::' + variant.family;
    families.set(key, [...(families.get(key) ?? []), model]);
  }
  const seen = new Set<string>();
  return models.flatMap((model) => {
    if (!agyKeys.has(model.agentKey)) return [model];
    const variant = antigravityEffortVariant(model.modelId);
    if (!variant) return [model];
    const familyKey = model.agentKey + '::' + variant.family;
    const group = families.get(familyKey) ?? [];
    const efforts = new Map(
      group.map((item) => [antigravityEffortVariant(item.modelId)?.effort, item]),
    );
    if (efforts.size < 2) return [model];
    if (seen.has(familyKey)) return [];
    seen.add(familyKey);
    const preferred =
      (model.agentKey === selectedAgentKey &&
        group.find((item) => item.modelId === selectedModelId)) ||
      efforts.get('high') ||
      efforts.get('medium') ||
      efforts.get('low') ||
      model;
    const selected = antigravityEffortVariant(preferred.modelId)!;
    return [
      {
        ...preferred,
        modelName: preferred.modelName.replace(/\s*\((High|Medium|Low)\)$/iu, ''),
        reasoningEfforts: (['high', 'medium', 'low'] as const).filter((e) => efforts.has(e)),
        defaultReasoningEffort: selected.effort,
      },
    ];
  });
}
