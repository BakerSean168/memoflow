import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AIEvaluationReportFileAdapter } from '../ai-evaluation-report-file.adapter';

const tempDirs: string[] = [];

async function tempRoot(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  await mkdir(path.join(dir, 'history'), { recursive: true });
  await mkdir(path.join(dir, 'live-history'), { recursive: true });
  return dir;
}

function canonicalReport(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: '2026-08-22T03:00:00.000Z',
    mode: 'deterministic',
    casesPath: 'packages/ai/evals/core-cases.json',
    totalCases: 3,
    passedCases: 3,
    failedCases: 0,
    passRate: 1,
    byType: { open_chat: 1, goal_planning: 1, knowledge_answer: 1 },
    failedCaseIds: [],
    gatePassed: true,
    gateFailures: [],
    archivePath: 'reports/apps/ai/evals/history/2026-08-22T03-00-00.000Z.json',
    results: [],
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('AIEvaluationReportFileAdapter', () => {
  it('reads canonical Mastra-native latest reports', async () => {
    const reportsRoot = await tempRoot('memoflow-ai-evals-');
    await writeFile(
      path.join(reportsRoot, 'latest.json'),
      JSON.stringify(canonicalReport()),
      'utf8',
    );
    await writeFile(
      path.join(reportsRoot, 'live-latest.json'),
      JSON.stringify(
        canonicalReport({
          generatedAt: '2026-08-22T04:00:00.000Z',
          mode: 'live',
          provider: 'provider-1',
          model: 'model-1',
        }),
      ),
      'utf8',
    );

    const overview = await new AIEvaluationReportFileAdapter({ reportsRoot }).getOverview();

    expect(overview.latest.deterministic?.generatedAt).toBe('2026-08-22T03:00:00.000Z');
    expect(overview.latest.live?.generatedAt).toBe('2026-08-22T04:00:00.000Z');
  });

  it('sorts canonical history by generatedAt and applies the requested limit', async () => {
    const reportsRoot = await tempRoot('memoflow-ai-evals-');
    await writeFile(
      path.join(reportsRoot, 'history', 'a.json'),
      JSON.stringify(canonicalReport({ generatedAt: '2026-08-20T00:00:00.000Z' })),
      'utf8',
    );
    await writeFile(
      path.join(reportsRoot, 'history', 'b.json'),
      JSON.stringify(canonicalReport({ generatedAt: '2026-08-22T00:00:00.000Z' })),
      'utf8',
    );
    await writeFile(
      path.join(reportsRoot, 'history', 'c.json'),
      JSON.stringify(canonicalReport({ generatedAt: '2026-08-21T00:00:00.000Z' })),
      'utf8',
    );

    const overview = await new AIEvaluationReportFileAdapter({ reportsRoot }).getOverview({
      historyLimit: 2,
    });

    expect(overview.history.deterministic.map((entry) => entry.generatedAt)).toEqual([
      '2026-08-22T00:00:00.000Z',
      '2026-08-21T00:00:00.000Z',
    ]);
  });

  it('returns an empty overview when the canonical report root has no reports', async () => {
    const reportsRoot = await tempRoot('memoflow-ai-evals-');
    const overview = await new AIEvaluationReportFileAdapter({ reportsRoot }).getOverview();
    expect(overview.latest.deterministic).toBeUndefined();
    expect(overview.latest.live).toBeUndefined();
    expect(overview.history.deterministic).toEqual([]);
    expect(overview.history.live).toEqual([]);
  });
});
