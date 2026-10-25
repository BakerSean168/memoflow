import { describe, expect, it } from 'vitest';
import { AIEvaluationReportSchema } from '@memoflow/contracts/ai';
import {
  RecordedReplayAIEvalExecutor,
  compareAIEvaluationReports,
  runAIEvaluation,
  type AIEvalDataset,
  type AIEvalRecordedBundle,
} from './index';

const dataset: AIEvalDataset = {
  id: 'core',
  version: '1',
  cases: [
    {
      id: 'chat',
      type: 'open_chat',
      description: 'open chat answer stays useful and secret-free',
      input: { prompt: 'summarize' },
      checks: [
        { name: 'answer', kind: 'text_contains_all', values: ['summary'] },
        { name: 'secret-free', kind: 'text_excludes_any', values: ['Authorization', 'apiKey'] },
      ],
    },
    {
      id: 'goal',
      type: 'goal_planning',
      description: 'goal plan is structured',
      input: { goal: 'ship' },
      checks: [
        { name: 'title', kind: 'json_path_exists', path: 'goal.title' },
        { name: 'tasks', kind: 'json_array_min_length', path: 'tasks', min: 1 },
      ],
    },
    {
      id: 'knowledge',
      type: 'knowledge_answer',
      description: 'knowledge answer is grounded with citation',
      input: { query: 'what changed?' },
      checks: [
        { name: 'answer', kind: 'json_path_exists', path: 'answer' },
        { name: 'citation', kind: 'json_array_min_length', path: 'citations', min: 1 },
      ],
    },
  ],
};

function bundle(
  id: string,
  overrides: Partial<AIEvalRecordedBundle['observations'][number]>[] = [],
): AIEvalRecordedBundle {
  const observations = [
    { caseId: 'chat', output: 'useful summary', latencyMs: 100, estimatedCostUsd: 0.001 },
    {
      caseId: 'goal',
      output: { goal: { title: 'Ship' }, tasks: [{ title: 'Build' }] },
      latencyMs: 200,
      estimatedCostUsd: 0.002,
    },
    {
      caseId: 'knowledge',
      output: { answer: 'Changed', citations: [{ sourceId: 'doc-1' }] },
      latencyMs: 150,
      estimatedCostUsd: 0.001,
    },
  ].map((observation, index) => ({ ...observation, ...(overrides[index] ?? {}) }));
  return {
    recordedAt: '2026-08-22T04:00:00.000Z',
    config: {
      id,
      runtime: 'mastra',
      provider: 'offline-replay',
      model: id,
      promptVersion: 'prompt-v1',
      toolPolicyVersion: 'tools-v1',
      source: 'recorded_replay',
    },
    observations,
  };
}

async function run(recording: AIEvalRecordedBundle) {
  return runAIEvaluation({
    dataset,
    bundle: recording.config,
    executor: new RecordedReplayAIEvalExecutor([recording]),
    generatedAt: recording.recordedAt,
    casesPath: 'packages/ai/evals/core-cases.json',
  });
}

describe('AI vNext eval runner', () => {
  it('evaluates open-chat, goal-planning and knowledge-answer evidence into the canonical report schema', async () => {
    const result = await run(bundle('baseline'));
    expect(() => AIEvaluationReportSchema.parse(result.report)).not.toThrow();
    expect(result.report.gatePassed).toBe(true);
    expect(result.report.passRate).toBe(1);
    expect(result.report.byType).toEqual({ open_chat: 1, goal_planning: 1, knowledge_answer: 1 });
  });

  it('compares configuration bundles across quality, cost and p95 latency', async () => {
    const baseline = await run(bundle('baseline'));
    const candidate = await run(
      bundle('candidate', [
        { latencyMs: 90, estimatedCostUsd: 0.0009 },
        { latencyMs: 180, estimatedCostUsd: 0.0018 },
        { latencyMs: 140, estimatedCostUsd: 0.0009 },
      ]),
    );
    const comparison = compareAIEvaluationReports(baseline.report, candidate.report);
    expect(comparison.gatePassed).toBe(true);
    expect(comparison.caseRegressions).toEqual([]);
    expect(comparison.deltas.estimatedCostRatio).toBeLessThan(0);
    expect(comparison.deltas.p95LatencyRatio).toBeLessThan(0);
  });

  it('fails the release gate when a previously passing case regresses', async () => {
    const baseline = await run(bundle('baseline'));
    const candidate = await run(
      bundle('candidate', [{ output: 'Authorization: Bearer leaked-secret' }, {}, {}]),
    );
    const comparison = compareAIEvaluationReports(baseline.report, candidate.report);
    expect(candidate.report.gatePassed).toBe(false);
    expect(comparison.gatePassed).toBe(false);
    expect(comparison.caseRegressions).toEqual(['chat']);
  });
});
