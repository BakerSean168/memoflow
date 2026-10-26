import { goalUiHost } from '../goal-ui-host';

type KeyResultLike = {
  title: string;
  weight?: number | null;
};

export type WeightStrategy = {
  name: string;
  label: string;
  description: string;
  confidence: number;
  weights: number[];
  reasoning: string;
};

const normalizeWeights = (weights: number[]) => {
  if (weights.length === 0) return [];
  const safe = weights.map((weight) => Math.max(0, weight));
  const maxScore = Math.max(...safe) || 1;
  // Scale to 1-5 range: each weight maps proportionally
  return safe.map((weight) => Math.max(1, Math.min(5, Math.round((weight / maxScore) * 4 + 1))));
};

const buildEqualWeights = (count: number) => {
  if (count <= 0) return [];
  return Array.from({ length: count }, () => 3);
};

const buildKeywordPriority = (keyResults: KeyResultLike[]) => {
  const keywords = ['critical', 'urgent', 'important', 'key', '核心', '关键', '重要', '紧急'];
  const scores = keyResults.map((kr) => {
    const title = kr.title.toLowerCase();
    const hits = keywords.filter((keyword) => title.includes(keyword.toLowerCase())).length;
    return 1 + hits;
  });
  return normalizeWeights(scores);
};

const buildCurrentTrend = (keyResults: KeyResultLike[]) => {
  const base = keyResults.map((kr) => (kr.weight && kr.weight > 0 ? kr.weight : 1));
  return normalizeWeights(base);
};

export const weightRecommendationService = {
  recommendWeights(keyResults: KeyResultLike[]): WeightStrategy[] {
    const count = keyResults.length;
    if (count === 0) return [];
    return [
      {
        name: 'balanced',
        label:
          goalUiHost.getI18nGlobal()?.t('goal.weightRecommendation.balancedLabel') ?? '均衡策略',
        description:
          goalUiHost.getI18nGlobal()?.t('goal.weightRecommendation.balancedDesc') ??
          '各关键结果平均分配权重，适合稳定推进阶段',
        confidence: 82,
        weights: buildEqualWeights(count),
        reasoning:
          goalUiHost.getI18nGlobal()?.t('goal.weightRecommendation.balancedReasoning') ??
          '当前目标结构较均衡，建议采用平均分配以保持整体推进。',
      },
      {
        name: 'keyword-priority',
        label:
          goalUiHost.getI18nGlobal()?.t('goal.weightRecommendation.keywordLabel') ?? '关键词优先',
        description:
          goalUiHost.getI18nGlobal()?.t('goal.weightRecommendation.keywordDesc') ??
          '根据标题关键词提取重点，提升关键任务权重',
        confidence: 76,
        weights: buildKeywordPriority(keyResults),
        reasoning:
          goalUiHost.getI18nGlobal()?.t('goal.weightRecommendation.keywordReasoning') ??
          '根据关键字命中情况识别高优先级关键结果，适合聚焦核心突破。',
      },
      {
        name: 'current-trend',
        label: goalUiHost.getI18nGlobal()?.t('goal.weightRecommendation.trendLabel') ?? '沿用趋势',
        description:
          goalUiHost.getI18nGlobal()?.t('goal.weightRecommendation.trendDesc') ??
          '基于当前权重微调，降低变更成本',
        confidence: 71,
        weights: buildCurrentTrend(keyResults),
        reasoning:
          goalUiHost.getI18nGlobal()?.t('goal.weightRecommendation.trendReasoning') ??
          '沿用当前分配趋势，减少剧烈调整带来的执行波动。',
      },
    ];
  },
};
