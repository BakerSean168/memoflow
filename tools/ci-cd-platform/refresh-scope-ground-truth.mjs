#!/usr/bin/env node
/**
 * Refreshes the Nx scope snapshot of the Scope Ground Truth fixture.
 *
 * Only `scope` is regenerated from the current Nx project graph; `expected`
 * (risk level and lanes) stays hand-reviewed. If a refreshed scope no longer
 * satisfies an expectation, `scope-ground-truth.test.mjs` fails and the case
 * must be re-reviewed instead of silently re-baselined.
 *
 * Usage: node tools/ci-cd-platform/refresh-scope-ground-truth.mjs [--check]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { webFlowCandidateFiles } from './lib/risk.mjs';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
// Nx does not export file-level affected calculation publicly; these are the
// same functions `nx show projects --affected --files` uses (Nx 23.2).
const { createProjectGraphAsync } = require('nx/src/project-graph/project-graph');
const { filterAffected } = require('nx/src/project-graph/affected/affected-project-graph');
const { calculateFileChanges } = require('nx/src/project-graph/file-utils');

export const FIXTURE_PATH = 'tools/ci-cd-platform/__tests__/fixtures/scope-ground-truth.json';
const LANE_TARGETS = {
  unit: 'test',
  coverage: 'test:coverage',
  smoke: 'test:smoke',
  integration: 'test:integration',
  boundary: 'test:boundary',
  perf: 'test:perf',
};

const graph = await createProjectGraphAsync({ exitOnError: true });
async function affected(files) {
  if (files.length === 0) return [];
  const changes = calculateFileChanges(files, { files }, () => null);
  return Object.keys((await filterAffected(graph, changes)).nodes).sort();
}

const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
let drift = 0;
for (const entry of fixture.cases) {
  const projects = await affected(entry.files);
  const webFlowFiles = webFlowCandidateFiles(entry.files);
  const webProjects = await affected(webFlowFiles);
  const scope = {
    projects,
    ...Object.fromEntries(
      Object.entries(LANE_TARGETS).map(([key, target]) => [
        key,
        projects.filter((project) => graph.nodes[project]?.data?.targets?.[target]),
      ]),
    ),
    webFlow: webProjects.some((project) => ['web', 'api'].includes(project)),
    desktopFlow: projects.includes('desktop'),
  };
  if (JSON.stringify(scope) !== JSON.stringify(entry.scope)) {
    drift += 1;
    console.log(`[scope-ground-truth] scope drift: ${entry.id}`);
  }
  entry.scope = scope;
}
if (process.argv.includes('--check')) {
  if (drift > 0) process.exitCode = 1;
} else {
  await writeFile(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
}
console.log(`[scope-ground-truth] ${fixture.cases.length} cases, ${drift} drifted`);
