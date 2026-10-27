import type { AIEvaluationReport } from '@memoflow/ai-contracts';
import type {
  AIEvalCaseType,
  AIEvalComparisonPolicy,
  AIEvalComparisonResult,
  AIEvalRunMetrics,
} from './types';

export const DEFAULT_AI_EVAL_COMPARISON_POLICY: AIEvalComparisonPolicy = {
  minCandidatePassRate: 1,
  maxPassRateDrop: 0,
  maxCostIncreaseRatio: 0.2,
  maxP95LatencyIncreaseRatio: 0.25,
  maxNewFailedCases: 0,
  requiredCaseTypes: ['open_chat', 'goal_planning', 'knowledge_answer'],
};

function finiteMetadataNumber(metadata: Record<string, unknown>, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

export function collectAIEvalRunMetrics(report: AIEvaluationReport): AIEvalRunMetrics {
  const costs = report.results
    .map((result) => finiteMetadataNumber(result.metadata, 'estimatedCostUsd'))
    .filter((value): value is number => value !== undefined);
  const latencies = report.results
    .map((result) => finiteMetadataNumber(result.metadata, 'latencyMs'))
    .filter((value): value is number => value !== undefined);
  return {
    passRate: report.passRate,
    failedCases: report.failedCases,
    totalEstimatedCostUsd: costs.reduce((sum, value) => sum + value, 0),
    p95LatencyMs: percentile95(latencies),
  };
}

function ratio(candidate: number, baseline: number): number {
  if (baseline === 0) return candidate === 0 ? 0 : Number.POSITIVE_INFINITY;
  return (candidate - baseline) / baseline;
}

export function compareAIEvaluationReports(
  baselineReport: AIEvaluationReport,
  candidateReport: AIEvaluationReport,
  policy: AIEvalComparisonPolicy = DEFAULT_AI_EVAL_COMPARISON_POLICY,
): AIEvalComparisonResult {
  const baseline = collectAIEvalRunMetrics(baselineReport);
  const candidate = collectAIEvalRunMetrics(candidateReport);
  const gateFailures: string[] = [];
  const baselinePass = new Map(baselineReport.results.map((result) => [result.id, result.passed]));
  const caseRegressions = candidateReport.results
    .filter((result) => baselinePass.get(result.id) === true && !result.passed)
    .map((result) => result.id);

  if (candidate.passRate < policy.minCandidatePassRate) {
    gateFailures.push(
      `candidate pass rate ${candidate.passRate.toFixed(4)} below ${policy.minCandidatePassRate.toFixed(4)}`,
    );
  }
  if (baseline.passRate - candidate.passRate > policy.maxPassRateDrop) {
    gateFailures.push('candidate pass-rate regression exceeds policy');
  }
  if (candidate.failedCases - baseline.failedCases > policy.maxNewFailedCases) {
    gateFailures.push('candidate introduces too many new failed cases');
  }
  if (caseRegressions.length > policy.maxNewFailedCases) {
    gateFailures.push(`case regressions: ${caseRegressions.join(', ')}`);
  }

  const costRatio = ratio(candidate.totalEstimatedCostUsd, baseline.totalEstimatedCostUsd);
  const latencyRatio = ratio(candidate.p95LatencyMs, baseline.p95LatencyMs);
  if (costRatio > policy.maxCostIncreaseRatio)
    gateFailures.push(`estimated cost regression ${(costRatio * 100).toFixed(2)}%`);
  if (latencyRatio > policy.maxP95LatencyIncreaseRatio)
    gateFailures.push(`p95 latency regression ${(latencyRatio * 100).toFixed(2)}%`);

  const candidateTypes = new Set(candidateReport.results.map((result) => result.type));
  for (const required of policy.requiredCaseTypes as readonly AIEvalCaseType[]) {
    if (!candidateTypes.has(required))
      gateFailures.push(`candidate missing required case type: ${required}`);
  }

  return {
    gatePassed: gateFailures.length === 0,
    gateFailures,
    caseRegressions,
    baseline,
    candidate,
    deltas: {
      passRate: candidate.passRate - baseline.passRate,
      estimatedCostRatio: costRatio,
      p95LatencyRatio: latencyRatio,
    },
    policy,
  };
}
