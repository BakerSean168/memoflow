import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Nx 23.3 adapter: one scheduler deduplicates ^build / prisma-generate writers
// shared by build and typecheck, without selecting their project/target product.
export function selectBuildTasks(projectGraph, keys) {
  const { createTaskGraph } = require('nx/src/tasks-runner/create-task-graph');
  assert(
    keys.length > 0 && new Set(keys).size === keys.length,
    'nonempty unique build tasks required',
  );
  const graph = { tasks: {}, dependencies: {}, continuousDependencies: {}, roots: [] };
  const initiatingTaskIds = [];
  for (const key of keys) {
    const [project, ...parts] = key.split(':');
    const target = parts.join(':');
    assert(
      ['build', 'typecheck', 'runtime-scripts:build'].includes(target),
      `unexpected build target: ${key}`,
    );
    assert(projectGraph.nodes[project]?.data.targets?.[target], `unknown Nx task: ${key}`);
    const selected = createTaskGraph(projectGraph, {}, [project], [target], undefined, {
      __overrides_unparsed__: [],
    });
    const primary = Object.values(selected.tasks).find(
      (t) => t.target.project === project && t.target.target === target,
    );
    assert(primary, `Nx omitted primary task: ${key}`);
    initiatingTaskIds.push(primary.id);
    for (const [id, task] of Object.entries(selected.tasks)) {
      if (graph.tasks[id])
        assert.deepEqual(graph.tasks[id], task, `conflicting Nx dependency: ${id}`);
      graph.tasks[id] = task;
      for (const field of ['dependencies', 'continuousDependencies']) {
        graph[field][id] = [
          ...new Set([...(graph[field][id] ?? []), ...(selected[field][id] ?? [])]),
        ];
      }
    }
  }
  graph.roots = Object.keys(graph.tasks).filter(
    (id) => graph.dependencies[id].length === 0 && graph.continuousDependencies[id].length === 0,
  );
  // Nx can rebuild after sync generators. Prune that rebuild to this exact
  // selection and all dependencies, so it cannot add unrelated primary tasks.
  return { taskGraph: graph, initiatingTaskIds, taskIds: Object.keys(graph.tasks) };
}

export const successfulNxStatus = (status) =>
  ['success', 'local-cache', 'local-cache-kept-existing', 'remote-cache'].includes(status);

export async function executeBuildTasks(keys) {
  process.env.NX_DAEMON ??= 'false';
  process.env.NX_TUI = 'false';
  const { createProjectGraphAsync } = require('nx/src/project-graph/project-graph');
  const { readNxJson } = require('nx/src/config/configuration');
  const { runTasksForCommand } = require('nx/src/tasks-runner/run-command');
  const projectGraph = await createProjectGraphAsync({ exitOnError: true });
  const selection = selectBuildTasks(projectGraph, keys);
  const { taskResults, completed } = await runTasksForCommand(
    selection,
    projectGraph,
    { nxJson: readNxJson() },
    {
      targets: [...new Set(keys.map((k) => k.slice(k.indexOf(':') + 1)))],
      parallel: 3,
      outputStyle: 'static',
      nxBail: false,
    },
    { __overrides_unparsed__: [] },
    null,
    {},
    { excludeTaskDependencies: false, loadDotEnvFiles: true },
  );
  const tasks = Object.fromEntries(
    keys.map((key, index) => {
      const id = selection.initiatingTaskIds[index];
      const result = taskResults[id];
      return [
        key,
        {
          taskId: id,
          status: result?.status ?? 'missing',
          dependencies: selection.taskGraph.dependencies[id],
        },
      ];
    }),
  );
  return {
    completed,
    tasks,
    success: completed && Object.values(tasks).every((t) => successfulNxStatus(t.status)),
  };
}
