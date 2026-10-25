#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AIEvaluationReportSchema } from '../../packages/contracts/src/modules/ai/api/ai-evaluation-report.dto';
import {
  RecordedReplayAIEvalExecutor,
  compareAIEvaluationReports,
  runAIEvaluation,
  type AIEvalDataset,
  type AIEvalRecordedBundle,
} from '../../packages/ai/src/evals/index';

const root = process.cwd();
const defaults = {
  dataset: 'packages/ai/evals/core-cases.json',
  baseline: 'packages/ai/evals/bundles/mastra-reference-baseline.json',
  candidate: 'packages/ai/evals/bundles/mastra-vnext-candidate.json',
  out: 'reports/apps/ai/evals',
};

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.resolve(root, relativePath), 'utf8')) as T;
}

function archiveFileName(generatedAt: string): string {
  return `${generatedAt.replace(/[:.]/g, '-')}Z.json`.replace('ZZ.json', 'Z.json');
}

async function main(): Promise<void> {
  const datasetPath = arg('dataset', defaults.dataset);
  const baselinePath = arg('baseline', defaults.baseline);
  const candidatePath = arg('candidate', defaults.candidate);
  const outDir = arg('out', defaults.out);
  const [dataset, baselineRecording, candidateRecording] = await Promise.all([
    readJson<AIEvalDataset>(datasetPath),
    readJson<AIEvalRecordedBundle>(baselinePath),
    readJson<AIEvalRecordedBundle>(candidatePath),
  ]);

  if (baselineRecording.config.source !== candidateRecording.config.source) {
    throw new Error('Baseline and candidate evidence sources must match');
  }
  const executor = new RecordedReplayAIEvalExecutor([baselineRecording, candidateRecording]);
  const baseline = await runAIEvaluation({
    dataset,
    bundle: baselineRecording.config,
    executor,
    generatedAt: baselineRecording.recordedAt,
    casesPath: datasetPath,
    archivePath: `${outDir}/history/${archiveFileName(baselineRecording.recordedAt)}`,
  });
  const candidate = await runAIEvaluation({
    dataset,
    bundle: candidateRecording.config,
    executor,
    generatedAt: candidateRecording.recordedAt,
    casesPath: datasetPath,
    baselinePath,
    archivePath: `${outDir}/history/${archiveFileName(candidateRecording.recordedAt)}`,
  });
  const comparison = compareAIEvaluationReports(baseline.report, candidate.report);
  const gateFailures = [...candidate.report.gateFailures, ...comparison.gateFailures];
  const candidateReport = AIEvaluationReportSchema.parse({
    ...candidate.report,
    gatePassed: candidate.report.gatePassed && comparison.gatePassed,
    gateFailures,
  });

  const absoluteOut = path.resolve(root, outDir);
  const historyDir = path.join(absoluteOut, 'history');
  await mkdir(historyDir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(absoluteOut, 'baseline-latest.json'),
      `${JSON.stringify(baseline.report, null, 2)}\n`,
    ),
    writeFile(
      path.join(absoluteOut, 'latest.json'),
      `${JSON.stringify(candidateReport, null, 2)}\n`,
    ),
    writeFile(
      path.join(absoluteOut, 'comparison-latest.json'),
      `${JSON.stringify(
        {
          generatedAt: candidateRecording.recordedAt,
          evidenceSource: candidateRecording.config.source,
          dataset: { id: dataset.id, version: dataset.version, path: datasetPath },
          baselineBundle: baselineRecording.config,
          candidateBundle: candidateRecording.config,
          comparison,
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      path.join(historyDir, archiveFileName(baselineRecording.recordedAt)),
      `${JSON.stringify(baseline.report, null, 2)}\n`,
    ),
    writeFile(
      path.join(historyDir, archiveFileName(candidateRecording.recordedAt)),
      `${JSON.stringify(candidateReport, null, 2)}\n`,
    ),
  ]);

  console.log(`AI vNext eval: ${candidateReport.gatePassed ? 'PASS' : 'FAIL'}`);
  console.log(`evidence=${candidateRecording.config.source}`);
  console.log(
    `baseline=${baselineRecording.config.id} passRate=${baseline.report.passRate.toFixed(3)}`,
  );
  console.log(
    `candidate=${candidateRecording.config.id} passRate=${candidateReport.passRate.toFixed(3)}`,
  );
  console.log(`costDelta=${(comparison.deltas.estimatedCostRatio * 100).toFixed(2)}%`);
  console.log(`p95LatencyDelta=${(comparison.deltas.p95LatencyRatio * 100).toFixed(2)}%`);
  console.log(`report=${path.relative(root, path.join(absoluteOut, 'latest.json'))}`);
  if (!candidateReport.gatePassed) {
    for (const failure of gateFailures) console.error(`- ${failure}`);
    process.exitCode = 1;
  }
}

await main();
