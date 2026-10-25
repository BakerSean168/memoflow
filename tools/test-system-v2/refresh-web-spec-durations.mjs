#!/usr/bin/env node
/* eslint-disable @nx/enforce-module-boundaries -- governance tool maintains the Web-owned timing history */
/**
 * Rebuilds tools/test-system-v2/web-spec-durations.json from Playwright JSON
 * reports (the `web-specialized-*-results` artifacts of CI runs).
 *
 *   gh run download <run-id> --pattern 'web-specialized-*-results' --dir reports/web-timing/<run-id>
 *   node tools/test-system-v2/refresh-web-spec-durations.mjs --source "CI runs <ids>" \
 *     reports/web-timing/<run-id>/web-specialized-0-results/provider-results.json ...
 *
 * Per run, a spec weighs the sum of its first-attempt test durations; across
 * runs the median is kept. Results reported under a file that is no longer a
 * canonical spec (a split or move) are attributed by exact test title to the
 * canonical spec that now declares that title.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { WEB_SPECIALIZED_SPECS } from '../../apps/web/web-specialized-specs.mjs';
import { medianDuration } from './lib/shard-balance.mjs';

export const WEB_SPEC_DURATIONS_PATH = 'tools/test-system-v2/web-spec-durations.json';

export function collectTestDurations(report, now = Date.now()) {
  const startTime = report?.stats?.startTime;
  const timestamp = typeof startTime === 'string' ? Date.parse(startTime) : NaN;
  if (!Number.isFinite(timestamp) || timestamp > now) {
    throw new Error('Playwright report stats.startTime must be a valid, non-future timestamp');
  }
  const observedAt = new Date(timestamp).toISOString();
  const rows = [];
  const walk = (suite, file) => {
    const current = suite.file ?? file;
    for (const spec of suite.specs ?? []) {
      for (const result of spec.tests?.flatMap((entry) => entry.results ?? []) ?? []) {
        if ((result.retry ?? 0) === 0) {
          rows.push({
            file: spec.file ?? current,
            title: spec.title,
            durationMs: result.duration,
            observedAt,
          });
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child, current);
  };
  for (const suite of report.suites ?? []) walk(suite, suite.file);
  return rows;
}

export function indexTitles(sources) {
  const owners = new Map();
  for (const [spec, source] of Object.entries(sources)) {
    for (const match of source.matchAll(/\btest(?:\.\w+)?\(\s*(['"`])((?:(?!\1).)+)\1/gu)) {
      owners.set(match[2], spec);
    }
  }
  return owners;
}

/** @param runs Array of arrays of test rows, one inner array per CI run. */
export function buildDurationHistory({ runs, specs, titleOwners, source, generatedAt }) {
  const samples = new Map(specs.map((spec) => [spec, []]));
  const observations = new Map();
  for (const rows of runs) {
    const perRun = new Map();
    for (const row of rows) {
      const owner = specs.includes(row.file) ? row.file : titleOwners.get(row.title);
      if (!owner || !samples.has(owner)) continue;
      const observed = Date.parse(row.observedAt);
      if (!Number.isFinite(observed)) throw new Error(`Invalid observedAt for ${owner}`);
      observations.set(owner, Math.min(observations.get(owner) ?? Infinity, observed));
      perRun.set(owner, (perRun.get(owner) ?? 0) + row.durationMs);
    }
    for (const [spec, total] of perRun) samples.get(spec).push(total);
  }
  const entries = [...samples]
    .filter(([, values]) => values.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([spec, values]) => [
      spec,
      {
        durationMs: medianDuration(values),
        samples: values.length,
        observedAt: new Date(observations.get(spec)).toISOString(),
      },
    ]);
  return {
    version: 2,
    generatedAt,
    // The median still includes the oldest sample; refreshing cannot make it newer.
    observedAt: entries.length ? new Date(Math.min(...observations.values())).toISOString() : null,
    source,
    statistic: 'median across runs of per-run first-attempt test duration',
    specs: Object.fromEntries(entries),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf('--source');
  const source = sourceIndex >= 0 ? args.splice(sourceIndex, 2)[1] : 'unspecified';
  if (args.length === 0) throw new Error('pass one or more Playwright JSON report paths');
  // Group report files by run: reports/<run>/web-flow-N-results/results.json.
  const byRun = new Map();
  for (const file of args) {
    const run = file.split('/').at(-3) ?? file;
    const report = JSON.parse(await readFile(file, 'utf8'));
    byRun.set(run, [...(byRun.get(run) ?? []), ...collectTestDurations(report)]);
  }
  const sources = Object.fromEntries(
    await Promise.all(
      WEB_SPECIALIZED_SPECS.map(async (spec) => [
        spec,
        await readFile(`apps/web/e2e/${spec}`, 'utf8'),
      ]),
    ),
  );
  const history = buildDurationHistory({
    runs: [...byRun.values()],
    specs: [...WEB_SPECIALIZED_SPECS],
    titleOwners: indexTitles(sources),
    source,
    generatedAt: new Date().toISOString(),
  });
  await writeFile(WEB_SPEC_DURATIONS_PATH, `${JSON.stringify(history, null, 2)}\n`);
  const missing = WEB_SPECIALIZED_SPECS.filter((spec) => !history.specs[spec]);
  console.log(
    `[web-spec-durations] ${Object.keys(history.specs).length}/${WEB_SPECIALIZED_SPECS.length} specs from ${byRun.size} run(s)` +
      (missing.length ? `; missing: ${missing.join(', ')}` : ''),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
