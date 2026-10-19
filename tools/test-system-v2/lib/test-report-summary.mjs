import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';

function topSlowest(values, limit = 10) {
  return values
    .filter((entry) => Number.isFinite(entry.durationMs))
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, limit);
}

export function summarizeVitestReport(report, source = null) {
  const testResults = Array.isArray(report.testResults) ? report.testResults : [];
  return {
    framework: 'vitest',
    source,
    files: {
      total: testResults.length,
      passed: testResults.filter((result) => result.status === 'passed').length,
      failed: testResults.filter((result) => result.status === 'failed').length,
      skipped: testResults.filter((result) => ['pending', 'skipped'].includes(result.status))
        .length,
    },
    tests: {
      total: report.numTotalTests ?? 0,
      passed: report.numPassedTests ?? 0,
      failed: report.numFailedTests ?? 0,
      skipped: (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0),
      retries: testResults.reduce(
        (total, result) =>
          total +
          (result.assertionResults ?? []).reduce(
            (assertionTotal, assertion) => assertionTotal + (assertion.retryCount ?? 0),
            0,
          ),
        0,
      ),
    },
    slowestSpecs: topSlowest(
      testResults.map((result) => ({
        name: result.name,
        durationMs: Math.max(0, (result.endTime ?? 0) - (result.startTime ?? 0)),
      })),
    ),
    slowestTests: topSlowest(
      testResults.flatMap((result) =>
        (result.assertionResults ?? []).map((assertion) => ({
          name: assertion.fullName ?? assertion.title,
          file: result.name,
          durationMs: assertion.duration ?? 0,
          status: assertion.status,
        })),
      ),
    ),
  };
}

function collectPlaywrightSpecs(suites, target = []) {
  for (const suite of suites ?? []) {
    target.push(...(suite.specs ?? []));
    collectPlaywrightSpecs(suite.suites, target);
  }
  return target;
}

export function summarizePlaywrightReport(report, source = null) {
  const specs = collectPlaywrightSpecs(report.suites);
  const fileStates = new Map();
  const slowestTests = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let retries = 0;
  for (const spec of specs) {
    for (const test of spec.tests ?? []) {
      const results = test.results ?? [];
      retries += Math.max(0, results.length - 1);
      const finalResult = results.at(-1);
      const status = test.status ?? finalResult?.status ?? 'skipped';
      const state =
        status === 'skipped'
          ? 'skipped'
          : ['expected', 'passed'].includes(status)
            ? 'passed'
            : 'failed';
      if (state === 'passed') passed += 1;
      else if (state === 'failed') failed += 1;
      else skipped += 1;
      const currentFileState = fileStates.get(spec.file) ?? 'skipped';
      if (state === 'failed' || (state === 'passed' && currentFileState === 'skipped')) {
        fileStates.set(spec.file, state);
      } else if (!fileStates.has(spec.file)) {
        fileStates.set(spec.file, state);
      }
      slowestTests.push({
        name: spec.title,
        file: spec.file,
        durationMs: finalResult?.duration ?? 0,
        status,
      });
    }
  }
  const fileEntries = [...fileStates.entries()];
  return {
    framework: 'playwright',
    source,
    files: {
      total: fileEntries.length,
      passed: fileEntries.filter(([, status]) => status === 'passed').length,
      failed: fileEntries.filter(([, status]) => status === 'failed').length,
      skipped: fileEntries.filter(([, status]) => status === 'skipped').length,
    },
    tests: { total: passed + failed + skipped, passed, failed, skipped, retries },
    slowestSpecs: [],
    slowestTests: topSlowest(slowestTests),
  };
}

export function aggregateTestSummaries(reports) {
  const totals = {
    reportCount: reports.length,
    files: { total: 0, passed: 0, failed: 0, skipped: 0 },
    tests: { total: 0, passed: 0, failed: 0, skipped: 0, retries: 0 },
    slowestSpecs: [],
    slowestTests: [],
    reports: reports.map(({ framework, source }) => ({ framework, source })),
  };
  for (const report of reports) {
    for (const field of ['total', 'passed', 'failed', 'skipped']) {
      totals.files[field] += report.files[field] ?? 0;
      totals.tests[field] += report.tests[field] ?? 0;
    }
    totals.tests.retries += report.tests.retries ?? 0;
    totals.slowestSpecs.push(...report.slowestSpecs);
    totals.slowestTests.push(...report.slowestTests);
  }
  totals.slowestSpecs = topSlowest(totals.slowestSpecs);
  totals.slowestTests = topSlowest(totals.slowestTests);
  return totals;
}

export async function collectTestReportSummaries(root, sinceMs) {
  const candidates = await fg(
    [
      'reports/test-system-v2/**/*.json',
      'apps/**/test-results/**/*.json',
      'packages/**/test-results/**/*.json',
    ],
    {
      cwd: root,
      ignore: ['**/node_modules/**'],
    },
  );
  const reports = [];
  for (const relativeFile of candidates.sort()) {
    const file = path.resolve(root, relativeFile);
    if ((await stat(file)).mtimeMs + 1_000 < sinceMs) continue;
    let value;
    try {
      value = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      continue;
    }
    if (Number.isFinite(value?.numTotalTests) && Array.isArray(value?.testResults)) {
      reports.push(summarizeVitestReport(value, relativeFile));
    } else if (Array.isArray(value?.suites) && value?.config) {
      reports.push(summarizePlaywrightReport(value, relativeFile));
    }
  }
  return aggregateTestSummaries(reports);
}
