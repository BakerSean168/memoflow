#!/usr/bin/env node
/**
 * Shadow comparison of the two Nx affected selectors.
 *
 * Computes, for the same change set, the task set the legacy project-based
 * selector (`filterAffected` + `selectTasksForProjects`, what
 * `nx affected -t ...` runs today) and the task-based selector introduced in
 * Nx 23.3 (`NX_LEGACY_AFFECTED=false`, `selectAffectedTasks` over the hash
 * planner) would each initiate, then diffs them. It never changes what CI
 * executes; a diff is data, not a gate.
 *
 * A tool failure is a report outcome, not a silent "no differences": the JSON
 * artifact and the step summary keep `status: "error"` with the message, and
 * the process exits non-zero so the (non-blocking) CI step is visibly failed.
 *
 * Usage:
 *   node tools/ci-cd-platform/shadow-affected.mjs [--base <sha>] [--head <sha>]
 *     [--files a,b] [--fixture <ground-truth.json>] [--only id1,id2]
 *     [--targets t1,t2] [--json-out <path>] [--markdown-out <path>] [--check]
 *
 * `--base`/`--head` fall back to NX_BASE/NX_HEAD (the CI scope-detector
 * environment). Without a base, files, or fixture the run is reported as
 * skipped instead of guessing a comparison basis.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { setMaxListeners } from 'node:events';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest } from './lib/contracts.mjs';
import { classifyRisk, selectLanes, webFlowCandidateFiles } from './lib/risk.mjs';
import {
  DEFAULT_SHADOW_TARGETS,
  buildErrorReport,
  buildShadowReport,
  diffSelection,
  legacyReachForProject,
  renderShadowMarkdown,
  summarizeCases,
} from './lib/affected-shadow.mjs';

// Both selectors must see the same graph in the same process; the daemon is
// disabled so selection never depends on a long-lived process elsewhere.
process.env.NX_DAEMON ??= 'false';
setMaxListeners(32);

const require = createRequire(path.join(process.cwd(), 'package.json'));
// Nx does not export these affected entry points as a public API; they are
// the exact functions the `nx affected` command itself dispatches to (Nx
// 23.3), the same precedent as refresh-scope-ground-truth.mjs.
const { createProjectGraphAsync } = require('nx/src/project-graph/project-graph');
const { filterAffected } = require('nx/src/project-graph/affected/affected-project-graph');
const { runTouchedProjectLocators } = require('nx/src/project-graph/affected/affected-projects');
const { calculateFileChanges, readPackageJson } = require('nx/src/project-graph/file-utils');
const { selectAffectedTasks } = require('nx/src/project-graph/affected/affected-tasks');
const { hydrateExplanation } = require('nx/src/project-graph/affected/affected-reasons');
const { createTaskPlanningContext } = require('nx/src/hasher/task-planning-context');
const { selectTasksForProjects } = require('nx/src/tasks-runner/run-command');
const { projectHasTarget } = require('nx/src/utils/project-graph-utils');
const { readNxJson } = require('nx/src/config/configuration');
const { parseFiles } = require('nx/src/utils/command-line-utils');

function parseArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; ) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      index += 1;
      continue;
    }
    const equals = token.indexOf('=');
    if (equals > 0) {
      args.set(token.slice(2, equals), token.slice(equals + 1));
      index += 1;
      continue;
    }
    const key = token.replace(/^--/u, '');
    const next = argv[index + 1];
    // Boolean flags (e.g. --check) may appear without a value or be followed
    // by the next flag.
    args.set(key, next === undefined || next.startsWith('--') ? true : next);
    index += 2;
  }
  return args;
}

function parseList(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function writeOutputs(report, { jsonOut, markdownOut }) {
  const markdown = renderShadowMarkdown(report);
  await mkdir(path.dirname(jsonOut), { recursive: true });
  await writeFile(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
  await mkdir(path.dirname(markdownOut), { recursive: true });
  await writeFile(markdownOut, markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

function finalizeReport(report) {
  report.provenance = { generator: 'ci-cd-platform-v3/shadow-affected@1' };
  const { digest: _digest, ...content } = report;
  report.digest = digest(content);
  return report;
}

function byTarget(taskIds, taskGraph, targets) {
  return Object.fromEntries(
    targets.map((target) => [
      target,
      taskIds.filter((id) => taskGraph.tasks[id]?.target.target === target).length,
    ]),
  );
}

const LANE_TARGETS = {
  unit: 'test',
  coverage: 'test:coverage',
  smoke: 'test:smoke',
  integration: 'test:integration',
  boundary: 'test:boundary',
  perf: 'test:perf',
};

/**
 * Whether switching the selector to task-based affected would disable a lane
 * the hand-reviewed ground truth expects to run. This is the acceptance
 * metric of the replay: a task may be dropped from a lane without harm, a
 * whole lane must never go dark for a case that needs it.
 */
async function laneImpact({ changedFiles, expected, legacyProjects, taskBasedTasks, taskGraph, targets, graph, nxJson, packageJson, planningContext }) {
  const risk = classifyRisk(changedFiles);
  const laneArgs = { event: 'pull_request', full: false };
  const legacyLists = Object.fromEntries(
    Object.entries(LANE_TARGETS).map(([lane, target]) => [
      lane,
      legacyProjects.filter((project) => projectHasTarget(graph.nodes[project], target)),
    ]),
  );
  const taskBasedLists = Object.fromEntries(
    Object.entries(LANE_TARGETS).map(([lane, target]) => [
      lane,
      [
        ...new Set(
          taskBasedTasks
            .map((id) => taskGraph.tasks[id]?.target)
            .filter((target2) => target2?.target === target)
            .map((target2) => target2.project),
        ),
      ].sort(),
    ]),
  );

  // Web Flow is decided on its own file subset (Desktop-only and docs files are
  // excluded); the task-based selector must be replayed on that same subset.
  const webFlowFiles = webFlowCandidateFiles(changedFiles);
  let legacyWebFlow = false;
  let taskBasedWebFlow = false;
  if (webFlowFiles.length > 0) {
    const webFlowChanges = calculateFileChanges(webFlowFiles, { files: webFlowFiles }, () => null);
    const webFlowAffected = await filterAffected(graph, webFlowChanges, nxJson, packageJson, true);
    legacyWebFlow = Object.keys(webFlowAffected.nodes).some((project) => ['web', 'api'].includes(project));
    const webFlowSelection = await selectAffectedTasks(
      graph,
      nxJson,
      planningContext,
      {
        targets,
        changedFiles: webFlowFiles,
        fileChangeArgs: { files: webFlowFiles },
        overrides: {},
        extraTargetDependencies: {},
        excludeTaskDependencies: false,
        exclude: [],
        explain: false,
      },
      { touchedFiles: webFlowChanges, packageJson },
    );
    taskBasedWebFlow = webFlowSelection.taskSelection.initiatingTaskIds.some(
      (id) =>
        ['web', 'api'].includes(webFlowSelection.taskSelection.taskGraph.tasks[id]?.target.project),
    );
  }

  const legacyLanes = selectLanes({
    risk,
    scope: {
      ...legacyLists,
      webFlow: legacyWebFlow,
      desktopFlow: legacyProjects.includes('desktop'),
    },
    ...laneArgs,
  });
  const taskBasedLanes = selectLanes({
    risk,
    scope: {
      ...taskBasedLists,
      webFlow: taskBasedWebFlow,
      desktopFlow: taskBasedTasks.some((id) => taskGraph.tasks[id]?.target.project === 'desktop'),
    },
    ...laneArgs,
  });

  const droppedLanes = Object.keys(expected.lanes).filter(
    (lane) => expected.lanes[lane] === true && taskBasedLanes[lane] === false,
  );
  const gainedLanes = Object.keys(expected.lanes).filter(
    (lane) => expected.lanes[lane] === false && taskBasedLanes[lane] === true,
  );
  const legacyLaneDrift = Object.keys(expected.lanes).filter(
    (lane) => expected.lanes[lane] !== legacyLanes[lane],
  );
  return {
    expectedLanes: expected.lanes,
    legacyLanes,
    taskBasedLanes,
    droppedLanes,
    gainedLanes,
    legacyLaneDrift,
    taskBasedScope: {
      ...taskBasedLists,
      webFlow: taskBasedWebFlow,
      desktopFlow: taskBasedTasks.some((id) => taskGraph.tasks[id]?.target.project === 'desktop'),
    },
  };
}

async function compareCase({ id, title, files, base, head, targets, graph, nxJson, packageJson, planningContext, expected }) {
  // Live mode must resolve the base..head file list the way `nx affected` does
  // (parseFiles → git diff base head); calculateFileChanges only annotates the
  // paths it is given, so passing [] compared two empty selections.
  const touchedFiles =
    files !== undefined
      ? calculateFileChanges(files, { files }, () => null)
      : calculateFileChanges(parseFiles({ base, head }).files, { base, head });
  const fileChangeArgs = files !== undefined ? { files } : { base, head, files: [] };
  const changedFiles = touchedFiles.map((change) => change.file);

  // Legacy selector: exactly what `nx affected` runs with NX_LEGACY_AFFECTED
  // unset — every affected project's task for each requested target.
  const affectedGraph = await filterAffected(graph, touchedFiles, nxJson, packageJson, true);
  const legacyProjects = Object.keys(affectedGraph.nodes).sort();
  const legacyProjectsForTargets = legacyProjects.filter((project) =>
    targets.some((target) => projectHasTarget(graph.nodes[project], target)),
  );
  const legacySelection = selectTasksForProjects(
    graph,
    legacyProjectsForTargets,
    { targets, configuration: undefined },
    {},
    {},
    false,
  );
  const legacyTasks = [...legacySelection.initiatingTaskIds].sort();

  // Task-based selector: what `nx affected` runs with NX_LEGACY_AFFECTED=false.
  const taskSelection = await selectAffectedTasks(
    graph,
    nxJson,
    planningContext,
    {
      targets,
      changedFiles,
      fileChangeArgs,
      configuration: undefined,
      overrides: {},
      extraTargetDependencies: {},
      excludeTaskDependencies: false,
      exclude: [],
      explain: true,
    },
    { touchedFiles, packageJson },
  );
  const taskBasedTasks = [...taskSelection.taskSelection.initiatingTaskIds].sort();
  const explanation = taskSelection.explanation ? hydrateExplanation(taskSelection.explanation) : undefined;

  const diff = diffSelection(legacyTasks, taskBasedTasks);
  const taskGraph = taskSelection.taskGraph;
  const legacyTaskGraph = legacySelection.taskGraph;

  const projectDependencies = Object.fromEntries(
    Object.entries(graph.dependencies).map(([project, edges]) => [
      project,
      edges.map((edge) => edge.target).filter((target) => graph.nodes[target] !== undefined),
    ]),
  );
  const projectRoots = Object.fromEntries(
    Object.entries(graph.nodes).map(([project, node]) => [project, node.data.root]),
  );
  const touchedProjects = [
    ...(await runTouchedProjectLocators(graph, touchedFiles, nxJson, packageJson, true)),
  ].sort();

  const underDetails = diff.underSelection.map((taskId) => {
    const target = legacyTaskGraph.tasks[taskId]?.target ?? taskGraph.tasks[taskId]?.target;
    return {
      task: taskId,
      project: target?.project,
      target: target?.target,
      legacyReach: legacyReachForProject(target?.project, {
        projectDependencies,
        touchedProjects,
        changedFiles,
        projectRoots,
      }),
    };
  });
  const overDetails = diff.overSelection.map((taskId) => ({
    task: taskId,
    reasons: explanation?.affected[taskId] ?? explanation?.upstream[taskId] ?? [],
  }));

  return {
    id,
    title,
    status: 'ok',
    changedFiles: changedFiles.sort(),
    legacy: {
      projects: legacyProjects,
      tasks: legacyTasks,
      byTarget: byTarget(legacyTasks, legacyTaskGraph, targets),
    },
    taskBased: {
      tasks: taskBasedTasks,
      byTarget: byTarget(taskBasedTasks, taskGraph, targets),
    },
    diff,
    underDetails,
    overDetails,
    ...(expected
      ? {
          laneImpact: await laneImpact({
            changedFiles: changedFiles.sort(),
            expected,
            legacyProjects,
            taskBasedTasks,
            taskGraph,
            targets,
            graph,
            nxJson,
            packageJson,
            planningContext,
          }),
        }
      : {}),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const targets = parseList(args.get('targets'));
  if (targets.length === 0) targets.push(...DEFAULT_SHADOW_TARGETS);
  const jsonOut = path.resolve(args.get('json-out') ?? 'reports/ci-cd-platform/affected-shadow-v1.json');
  const markdownOut = path.resolve(args.get('markdown-out') ?? 'reports/ci-cd-platform/affected-shadow-v1.md');
  const fixturePath = args.get('fixture');
  const files = args.get('files') !== undefined ? parseList(args.get('files')) : undefined;
  const only = new Set(parseList(args.get('only')));
  const base = args.get('base') ?? process.env.NX_BASE;
  const head = args.get('head') ?? process.env.NX_HEAD;
  const check = args.has('check');

  const writeReport = async (report) => {
    finalizeReport(report);
    await writeOutputs(report, { jsonOut, markdownOut });
    return report;
  };

  // Skipped is a report outcome: CI on events without a diff basis (schedule,
  // workflow_dispatch without a base) must record why nothing was compared.
  if (fixturePath === undefined && files === undefined && !base) {
    await writeReport(
      buildShadowReport({
        mode: 'live',
        targets,
        source: { base: base ?? null, head: head ?? null },
        status: 'skipped',
        skipReason: 'no --base/--head (or NX_BASE/NX_HEAD), --files, or --fixture provided',
      }),
    );
    console.log('[shadow-affected] skipped: no comparison basis');
    return;
  }

  let mode;
  let source;
  let caseInputs = [];
  if (fixturePath !== undefined) {
    const fixture = JSON.parse(await readFile(path.resolve(fixturePath), 'utf8'));
    const cases = only.size > 0 ? fixture.cases.filter((entry) => only.has(entry.id)) : fixture.cases;
    if (cases.length === 0) throw new Error(`no fixture cases selected from ${fixturePath}`);
    mode = 'replay';
    source = { fixture: fixturePath, baseline: fixture.baseline ?? null, reviewedAt: fixture.reviewedAt ?? null };
    caseInputs = cases.map((entry) => ({
      id: entry.id,
      title: entry.title,
      files: entry.files,
      expected: entry.expected,
    }));
  } else {
    mode = 'live';
    source = { base: base ?? null, head: head ?? null, ...(files ? { files } : {}) };
    caseInputs = [{ id: 'live', title: undefined, files, base, head }];
  }

  const nxJson = readNxJson();
  const packageJson = readPackageJson();
  const graph = await createProjectGraphAsync({ exitOnError: true });
  const planningContext = createTaskPlanningContext(graph, nxJson);

  const caseResults = [];
  for (const input of caseInputs) {
    try {
      caseResults.push(
        await compareCase({
          id: input.id,
          title: input.title,
          files: input.files,
          base: input.base,
          head: input.head,
          targets,
          graph,
          nxJson,
          packageJson,
          planningContext,
          expected: input.expected,
        }),
      );
    } catch (error) {
      caseResults.push({
        id: input.id,
        title: input.title,
        status: 'error',
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: String(error?.stack ?? '').split('\n').slice(0, 10).join('\n'),
        },
      });
      console.error(`[shadow-affected] case ${input.id} failed: ${error?.message}`);
    }
  }

  const summary = summarizeCases(caseResults);
  const failed = summary.errors > 0;
  const report = buildShadowReport({
    mode,
    targets,
    source,
    status: failed ? 'error' : 'ok',
    ...(failed ? { error: { message: `${summary.errors} of ${summary.cases} comparison case(s) failed` } } : {}),
    summary,
    cases: caseResults,
  });
  await writeReport(report);

  const hasUnder = summary.underSelections > 0;
  console.log(
    `[shadow-affected] ${mode}: ${summary.cases} case(s), ${summary.identical} identical, ` +
      `${summary.withDiffs} with diffs, ${summary.underSelections} under-selection(s), ` +
      `${summary.overSelections} over-selection(s), ${summary.droppedLanes} dropped lane(s) ` +
      `in ${summary.droppedLaneCases} case(s), ${summary.legacyLaneDrift} legacy lane drift(s), ` +
      `${summary.errors} error(s)`,
  );
  if (failed) process.exitCode = 1;
  else if (check && hasUnder) {
    process.exitCode = 1;
    console.error('[shadow-affected] --check failed: under-selection(s) present');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    // The report must survive a tool crash. Write the error artifact and the
    // step summary first, then surface the failure through the exit code.
    try {
      const args = parseArgs(process.argv);
      const jsonOut = path.resolve(
        args.get('json-out') ?? 'reports/ci-cd-platform/affected-shadow-v1.json',
      );
      const markdownOut = path.resolve(
        args.get('markdown-out') ?? 'reports/ci-cd-platform/affected-shadow-v1.md',
      );
      await writeOutputs(
        finalizeReport(
          buildErrorReport(
            {
              mode: args.get('fixture') !== undefined ? 'replay' : 'live',
              targets: parseList(args.get('targets')).length > 0 ? parseList(args.get('targets')) : DEFAULT_SHADOW_TARGETS,
              source: {
                ...(args.get('fixture') !== undefined ? { fixture: args.get('fixture') } : {}),
                base: args.get('base') ?? process.env.NX_BASE ?? null,
                head: args.get('head') ?? process.env.NX_HEAD ?? null,
              },
            },
            error,
          ),
        ),
        { jsonOut, markdownOut },
      );
    } catch (reportError) {
      console.error(`[shadow-affected] failed to write the error report: ${reportError?.message}`);
    }
    console.error(`[shadow-affected] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
