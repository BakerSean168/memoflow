import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// One Nx scheduler deduplicates ^build / prisma-generate writers
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
    assert(
      projectGraph.nodes[project]?.data.targets?.[target],
      `unknown Nx task: ${key} (graph projects: ${Object.keys(projectGraph.nodes).join(', ') || '<none>'})`,
    );
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
        const edges = new Map((graph[field][id] ?? []).map((edge) => [edge.id, edge]));
        for (const edge of selected[field][id] ?? []) {
          if (edges.has(edge.id)) {
            assert.deepEqual(edges.get(edge.id), edge, `conflicting Nx dependency edge: ${id}`);
          }
          edges.set(edge.id, edge);
        }
        graph[field][id] = [...edges.values()];
      }
    }
  }
  // The canonical database artifact owns dist/, while runtime scripts own a
  // nested output. Restore/finish the parent artifact before the child writer.
  // Keep this CI resource ordering here rather than changing a business target.
  if (graph.tasks['database:build'] && graph.tasks['database:runtime-scripts:build']) {
    const dependencies = graph.dependencies['database:runtime-scripts:build'];
    if (!dependencies.some((edge) => edge.id === 'database:build')) {
      dependencies.push({ id: 'database:build' });
    }
  }
  graph.roots = Object.keys(graph.tasks).filter(
    (id) => graph.dependencies[id].length === 0 && graph.continuousDependencies[id].length === 0,
  );
  // Nx can rebuild after sync generators. Prune that rebuild to this exact
  // selection and all dependencies, so it cannot add unrelated primary tasks.
  // Nx 24 uses edge objects. Keep task IDs at the CI/receipt boundary while
  // handing the full native edges (including readiness metadata) to Nx.
  const taskGraph = { ...graph };
  for (const field of ['dependencies', 'continuousDependencies']) {
    taskGraph[field] = Object.fromEntries(
      Object.entries(graph[field]).map(([id, edges]) => [id, edges.map((edge) => edge.id)]),
    );
  }
  return {
    taskGraph,
    nativeTaskGraph: graph,
    initiatingTaskIds,
    taskIds: Object.keys(graph.tasks),
  };
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
    { ...selection, taskGraph: selection.nativeTaskGraph },
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
