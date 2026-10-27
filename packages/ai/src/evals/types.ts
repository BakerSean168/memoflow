import type { AIEvaluationReport } from '@memoflow/ai-contracts';

export type AIEvalCaseType = 'open_chat' | 'goal_planning' | 'knowledge_answer';
export type AIEvalEvidenceSource = 'recorded_replay' | 'live';

export type AIEvalCheckDefinition =
  | {
      readonly name: string;
      readonly kind: 'text_contains_all';
      readonly values: readonly string[];
    }
  | {
      readonly name: string;
      readonly kind: 'text_excludes_any';
      readonly values: readonly string[];
    }
  | { readonly name: string; readonly kind: 'json_path_exists'; readonly path: string }
  | {
      readonly name: string;
      readonly kind: 'json_path_equals';
      readonly path: string;
      readonly value: unknown;
    }
  | {
      readonly name: string;
      readonly kind: 'json_array_min_length';
      readonly path: string;
      readonly min: number;
    };

export interface AIEvalCase {
  readonly id: string;
  readonly type: AIEvalCaseType;
  readonly description: string;
  readonly input: unknown;
  readonly checks: readonly AIEvalCheckDefinition[];
}

export interface AIEvalDataset {
  readonly id: string;
  readonly version: string;
  readonly cases: readonly AIEvalCase[];
}

export interface AIEvalConfigurationBundle {
  readonly id: string;
  readonly runtime: 'mastra';
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly toolPolicyVersion: string;
  readonly source: AIEvalEvidenceSource;
}

export interface AIEvalTokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface AIEvalObservation {
  readonly caseId: string;
  readonly output: unknown;
  readonly latencyMs: number;
  readonly tokenUsage?: AIEvalTokenUsage;
  readonly estimatedCostUsd?: number;
  readonly errorCode?: string;
}

export interface AIEvalRecordedBundle {
  readonly recordedAt: string;
  readonly config: AIEvalConfigurationBundle;
  readonly observations: readonly AIEvalObservation[];
}

export interface AIEvalExecutor {
  execute(bundle: AIEvalConfigurationBundle, evalCase: AIEvalCase): Promise<AIEvalObservation>;
}

export interface AIEvalRunResult {
  readonly bundle: AIEvalConfigurationBundle;
  readonly report: AIEvaluationReport;
}

export interface AIEvalComparisonPolicy {
  readonly minCandidatePassRate: number;
  readonly maxPassRateDrop: number;
  readonly maxCostIncreaseRatio: number;
  readonly maxP95LatencyIncreaseRatio: number;
  readonly maxNewFailedCases: number;
  readonly requiredCaseTypes: readonly AIEvalCaseType[];
}

export interface AIEvalRunMetrics {
  readonly passRate: number;
  readonly failedCases: number;
  readonly totalEstimatedCostUsd: number;
  readonly p95LatencyMs: number;
}

export interface AIEvalComparisonResult {
  readonly gatePassed: boolean;
  readonly gateFailures: readonly string[];
  readonly caseRegressions: readonly string[];
  readonly baseline: AIEvalRunMetrics;
  readonly candidate: AIEvalRunMetrics;
  readonly deltas: {
    readonly passRate: number;
    readonly estimatedCostRatio: number;
    readonly p95LatencyRatio: number;
  };
  readonly policy: AIEvalComparisonPolicy;
}
