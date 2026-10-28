import { createRequire } from 'node:module';
import { digest } from './contracts.mjs';

const require = createRequire(import.meta.url);
process.env.NX_DAEMON ??= 'false';
export const CI_TARGETS = Object.freeze([
  'build',
  'typecheck',
  'test',
  'test:contract',
  'test:smoke',
  'test:integration',
  'test:boundary',
  'test:ipc',
  'test:main',
  'test:perf',
  'test:interaction',
  'e2e:ai-provider',
  'e2e:visual-regression',
  'test:coverage',
]);

// Use the same Nx 24 task planner and Ultracache file-read inputs as
// "nx affected". Keep internal Nx API imports isolated and covered by tests.
// Without a valid Cloud recording Nx safely falls back to declared task inputs.
export async function loadAffectedRunnerInputs(
  nxJson,
  {
    runnerInputsForSelection = require('nx/src/tasks-runner/run-command').runnerInputsForSelection,
    configurationsOf = require('nx/src/ultracache/store').configurationsOf,
  } = {},
) {
  const { ultracacheConfigurationOutcome, selectivelyHashTsConfig } =
    await runnerInputsForSelection({ targets: [...CI_TARGETS] }, nxJson);
  return {
    selectivelyHashTsConfig,
    ultracacheConfigurations: configurationsOf(ultracacheConfigurationOutcome),
    ultracache:
      ultracacheConfigurationOutcome?.status === 'skipped'
        ? { status: 'skipped', reason: ultracacheConfigurationOutcome.reason }
        : ultracacheConfigurationOutcome
          ? {
              status: ultracacheConfigurationOutcome.status,
              ...ultracacheConfigurationOutcome.configurations.resolution,
            }
          : { status: 'disabled' },
  };
}

export async function selectCiTasks(
  { files, base, head, full },
  { loadRunnerInputs = loadAffectedRunnerInputs } = {},
) {
  const { createProjectGraphAsync } = require('nx/src/project-graph/project-graph');
  const { selectAffectedTasks } = require('nx/src/project-graph/affected/affected-tasks');
  const { createTaskPlanningContext } = require('nx/src/hasher/task-planning-context');
  const { calculateFileChanges, readPackageJson } = require('nx/src/project-graph/file-utils');
  const { readNxJson } = require('nx/src/config/configuration');
  const graph = await createProjectGraphAsync({ exitOnError: true });
  const nxJson = readNxJson();
  const all = Object.fromEntries(
    CI_TARGETS.map((target) => [
      target,
      Object.keys(graph.nodes)
        .filter((p) => graph.nodes[p].data.targets?.[target])
        .sort(),
    ]),
  );
  let targets = all;
  let fallback = null;
  let ultracache = { status: 'not-requested', reason: 'full-scope' };
  if (!full) {
    try {
      // Removed/unregistered projects disappear from the current graph. Nx
      // can then select only workspace governance inputs for their old paths.
      // A root project is not a sufficient owner for application/package code.
      const roots = Object.values(graph.nodes)
        .map((node) => node.data.root)
        .filter((root) => root && root !== '.');
      const unowned = files.filter(
        (file) =>
          /^(?:apps|packages)\//u.test(file) &&
          !roots.some((root) => file === root || file.startsWith(`${root}/`)),
      );
      if (unowned.length) throw new Error(`Unknown project owner: ${unowned.join(', ')}`);
      const fileChangeArgs = base && head ? { base, head, files: [] } : { files };
      // Nx's own affected CLI calls runnerInputsForSelection() before planning.
      // Pass that same context to our selector; otherwise Nx Cloud's recorded
      // file reads never reach the planner and PR CI remains project-grained.
      const runnerInputs = await loadRunnerInputs(nxJson);
      ultracache = runnerInputs.ultracache;
      const result = await selectAffectedTasks(
        graph,
        nxJson,
        createTaskPlanningContext(graph, nxJson),
        {
          targets: [...CI_TARGETS],
          changedFiles: files,
          fileChangeArgs,
          overrides: {},
          extraTargetDependencies: {},
          excludeTaskDependencies: false,
          exclude: [],
          selectivelyHashTsConfig: runnerInputs.selectivelyHashTsConfig,
          explain: false,
        },
        {
          touchedFiles: calculateFileChanges(files, fileChangeArgs),
          packageJson: readPackageJson(),
          ultracacheConfigurations: runnerInputs.ultracacheConfigurations,
        },
      );
      if (runnerInputs.ultracacheConfigurations) {
        const { buildUltracacheOverrides } = require('nx/src/ultracache/overrides');
        const report = buildUltracacheOverrides(
          graph,
          result.taskGraph,
          runnerInputs.ultracacheConfigurations,
        );
        ultracache = { ...ultracache, used: report.used, diagnostics: report.diagnostics };
      }
      const selected = [...result.taskSelection.initiatingTaskIds].map(
        (id) => result.taskGraph.tasks[id].target,
      );
      targets = Object.fromEntries(
        CI_TARGETS.map((target) => [
          target,
          [...new Set(selected.filter((t) => t.target === target).map((t) => t.project))].sort(),
        ]),
      );
    } catch (error) {
      // A selector failure expands to all known tasks, never an empty green plan.
      fallback = `Nx task selection failed: ${error.message}`;
    }
  }
  const noopTasks = Object.entries(targets).flatMap(([target, projects]) =>
    projects
      .filter((project) => graph.nodes[project].data.targets[target].executor === 'nx:noop')
      .map((project) => `${project}:${target}`),
  );
  return {
    targets,
    fallback,
    ultracache,
    noopTasks,
    unitContractAliases: targets.test.filter(
      (project) =>
        targets['test:contract'].includes(project) &&
        equivalentUnitContractTargets(graph.nodes[project].data.targets),
    ),
    projects: [...new Set(Object.values(targets).flat())].sort(),
  };
}

// A target name is not a suite identity. Only route both targets to Contract
// when Nx would invoke the exact same executor/options/configurations.
export function equivalentUnitContractTargets(targets) {
  const fingerprint = (target) =>
    target &&
    (typeof target.options?.command === 'string' || Array.isArray(target.options?.commands))
      ? digest({
          executor: target.executor,
          options: target.options,
          configurations: target.configurations ?? {},
          defaultConfiguration: target.defaultConfiguration ?? null,
        })
      : null;
  const unit = fingerprint(targets?.test);
  return unit !== null && unit === fingerprint(targets?.['test:contract']);
}
