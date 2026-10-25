import {
  AIEvaluationReportSchema,
  type AIEvaluationCheck,
  type AIEvaluationResult,
} from '@memoflow/contracts/ai';
import type {
  AIEvalCase,
  AIEvalCheckDefinition,
  AIEvalConfigurationBundle,
  AIEvalDataset,
  AIEvalExecutor,
  AIEvalObservation,
  AIEvalRunResult,
} from './types';

function readPath(value: unknown, path: string): unknown {
  return path
    .split('.')
    .filter(Boolean)
    .reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
      return (current as Record<string, unknown>)[segment];
    }, value);
}

function asSearchableText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function evaluateCheck(output: unknown, check: AIEvalCheckDefinition): AIEvaluationCheck {
  switch (check.kind) {
    case 'text_contains_all': {
      const text = asSearchableText(output);
      const missing = check.values.filter((value) => !text.includes(value));
      return {
        name: check.name,
        passed: missing.length === 0,
        detail:
          missing.length === 0
            ? 'all required fragments present'
            : `missing: ${missing.join(', ')}`,
      };
    }
    case 'text_excludes_any': {
      const text = asSearchableText(output);
      const leaked = check.values.filter((value) => text.includes(value));
      return {
        name: check.name,
        passed: leaked.length === 0,
        detail:
          leaked.length === 0
            ? 'forbidden fragments absent'
            : `found forbidden: ${leaked.join(', ')}`,
      };
    }
    case 'json_path_exists': {
      const value = readPath(output, check.path);
      return {
        name: check.name,
        passed: value !== undefined && value !== null,
        detail:
          value !== undefined && value !== null ? `${check.path} exists` : `${check.path} missing`,
      };
    }
    case 'json_path_equals': {
      const value = readPath(output, check.path);
      const passed = JSON.stringify(value) === JSON.stringify(check.value);
      return {
        name: check.name,
        passed,
        detail: passed ? `${check.path} matches expected value` : `${check.path} mismatch`,
      };
    }
    case 'json_array_min_length': {
      const value = readPath(output, check.path);
      const length = Array.isArray(value) ? value.length : -1;
      return {
        name: check.name,
        passed: length >= check.min,
        detail:
          length >= check.min
            ? `${check.path} length ${length}`
            : `${check.path} length ${length}; expected >= ${check.min}`,
      };
    }
  }
}

function evaluateCase(
  evalCase: AIEvalCase,
  observation: AIEvalObservation,
  bundleId: string,
): AIEvaluationResult {
  const checks = evalCase.checks.map((check) => evaluateCheck(observation.output, check));
  if (observation.errorCode) {
    checks.push({ name: 'execution_error', passed: false, detail: observation.errorCode });
  }
  const passedCount = checks.filter((check) => check.passed).length;
  const score = checks.length === 0 ? 1 : passedCount / checks.length;
  return {
    id: evalCase.id,
    type: evalCase.type,
    description: evalCase.description,
    passed: checks.every((check) => check.passed),
    score,
    checks,
    metadata: {
      bundleId,
      latencyMs: observation.latencyMs,
      ...(observation.tokenUsage ? { tokenUsage: observation.tokenUsage } : {}),
      ...(observation.estimatedCostUsd !== undefined
        ? { estimatedCostUsd: observation.estimatedCostUsd }
        : {}),
      ...(observation.errorCode ? { errorCode: observation.errorCode } : {}),
    },
  };
}

export async function runAIEvaluation(input: {
  readonly dataset: AIEvalDataset;
  readonly bundle: AIEvalConfigurationBundle;
  readonly executor: AIEvalExecutor;
  readonly generatedAt: string;
  readonly casesPath: string;
  readonly archivePath?: string;
  readonly baselinePath?: string;
  readonly minPassRate?: number;
}): Promise<AIEvalRunResult> {
  const results: AIEvaluationResult[] = [];
  for (const evalCase of input.dataset.cases) {
    const observation = await input.executor.execute(input.bundle, evalCase);
    if (observation.caseId !== evalCase.id) {
      throw new Error(`Eval executor returned case ${observation.caseId} for ${evalCase.id}`);
    }
    results.push(evaluateCase(evalCase, observation, input.bundle.id));
  }

  const passedCases = results.filter((result) => result.passed).length;
  const totalCases = results.length;
  const passRate = totalCases === 0 ? 1 : passedCases / totalCases;
  const minPassRate = input.minPassRate ?? 1;
  const requiredTypes = new Set(input.dataset.cases.map((evalCase) => evalCase.type));
  const gateFailures: string[] = [];
  if (passRate < minPassRate)
    gateFailures.push(`pass rate ${passRate.toFixed(4)} below ${minPassRate.toFixed(4)}`);
  for (const required of ['open_chat', 'goal_planning', 'knowledge_answer'] as const) {
    if (!requiredTypes.has(required)) gateFailures.push(`required case type missing: ${required}`);
  }

  const byType = Object.fromEntries(
    [...requiredTypes].map((type) => [
      type,
      results.filter((result) => result.type === type).length,
    ]),
  );
  const report = AIEvaluationReportSchema.parse({
    generatedAt: input.generatedAt,
    mode: input.bundle.source === 'live' ? 'live' : 'deterministic',
    provider: input.bundle.provider,
    model: input.bundle.model,
    casesPath: input.casesPath,
    totalCases,
    passedCases,
    failedCases: totalCases - passedCases,
    passRate,
    byType,
    failedCaseIds: results.filter((result) => !result.passed).map((result) => result.id),
    gatePassed: gateFailures.length === 0,
    gateFailures,
    ...(input.baselinePath ? { baselinePath: input.baselinePath } : {}),
    ...(input.archivePath ? { archivePath: input.archivePath } : {}),
    results,
  });
  return { bundle: input.bundle, report };
}
