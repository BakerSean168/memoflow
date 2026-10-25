/**
 * Pure comparison and reporting logic for the legacy-vs-task-based affected
 * shadow comparison. Nx itself is only touched by the shadow-affected.mjs
 * entrypoint; everything here is deterministic and unit-testable.
 */

export const SHADOW_REPORT_KIND = 'affected-shadow-v1';

/**
 * The targets CI actually drives through `nx affected`, plus test:boundary,
 * whose project list feeds the scope detector's lane decision. The shadow
 * comparison never changes what CI runs; it only reports what each selector
 * would pick for these targets.
 */
export const DEFAULT_SHADOW_TARGETS = [
  'build',
  'lint',
  'typecheck',
  'test',
  'test:coverage',
  'test:smoke',
  'test:integration',
  'test:boundary',
  'test:perf',
];

/**
 * Diff two selected task sets. `underSelection` lists tasks the legacy
 * (project-based) selector runs that task-based affected would drop — the
 * correctness risk this shadow exists to surface. `overSelection` lists the
 * reverse, which usually means a task input reaches files the project graph
 * does not model as a dependency.
 */
export function diffSelection(legacyTasks, taskBasedTasks) {
  const legacy = new Set(legacyTasks);
  const taskBased = new Set(taskBasedTasks);
  return {
    identical: legacy.size === taskBased.size && [...legacy].every((id) => taskBased.has(id)),
    underSelection: [...legacy].filter((id) => !taskBased.has(id)).sort(),
    overSelection: [...taskBased].filter((id) => !legacy.has(id)).sort(),
  };
}

/**
 * Why the legacy selector reaches `project` for the current change set.
 *
 * The legacy selector affects every project that owns a changed file plus
 * everything depending on it. For a task the task-based selector dropped, this
 * is the evidence a human needs to decide whether the task's inputs cover the
 * change (fixable input gap) or the reach itself was legacy over-selection.
 *
 * `projectDependencies` maps project -> direct project dependencies (external
 * dependencies excluded). `changedFiles` are paths; `projectRoots` maps
 * project -> root ('.' for the root project). `touchedProjects` is the set the
 * Nx locators marked touched (which adds package.json / lockfile semantics
 * beyond file ownership).
 */
export function legacyReachForProject(
  project,
  { projectDependencies, touchedProjects, changedFiles, projectRoots },
) {
  const ownsFile = (file, owner) => {
    const root = projectRoots[owner];
    if (root === undefined) return false;
    const prefix = root === '.' ? '' : `${root}/`;
    if (!file.startsWith(prefix)) return false;
    // The root project only owns files no other project claims.
    if (root !== '.') return true;
    return Object.values(projectRoots).every(
      (other) => other === '.' || !file.startsWith(`${other}/`),
    );
  };
  const filesOf = (owner) => changedFiles.filter((file) => ownsFile(file, owner)).sort();
  const ownFiles = changedFiles.filter((file) => ownsFile(file, project)).sort();

  // Shortest dependency chains from `project` to any touched project.
  const touched = new Set(touchedProjects);
  const via = [];
  const queue = [[project]];
  const seenDepths = new Map([[project, 0]]);
  while (queue.length > 0 && via.length < 8) {
    const chain = queue.shift();
    const current = chain[chain.length - 1];
    for (const dependency of projectDependencies[current] ?? []) {
      if (seenDepths.has(dependency) && seenDepths.get(dependency) <= chain.length) continue;
      seenDepths.set(dependency, chain.length);
      const next = [...chain, dependency];
      if (touched.has(dependency)) {
        via.push({
          project: dependency,
          path: next,
          changedFiles: filesOf(dependency),
          metadataTouched: filesOf(dependency).length === 0,
        });
      } else {
        queue.push(next);
      }
    }
  }
  via.sort(
    (left, right) =>
      left.path.length - right.path.length || left.project.localeCompare(right.project),
  );

  return {
    project,
    kind: ownFiles.length > 0 ? 'own-file' : 'dependency',
    ownFiles,
    via,
  };
}

/** Aggregate replay cases into the report-level summary. */
export function summarizeCases(cases) {
  return cases.reduce(
    (summary, caseResult) => {
      summary.cases += 1;
      if (caseResult.status !== 'ok') {
        summary.errors += 1;
        return summary;
      }
      const { underSelection, overSelection } = caseResult.diff;
      if (underSelection.length === 0 && overSelection.length === 0) {
        summary.identical += 1;
      } else {
        summary.withDiffs += 1;
      }
      summary.underSelections += underSelection.length;
      summary.overSelections += overSelection.length;
      const laneImpact = caseResult.laneImpact;
      if (laneImpact) {
        summary.laneCheckedCases += 1;
        summary.droppedLanes += laneImpact.droppedLanes.length;
        if (laneImpact.droppedLanes.length > 0) summary.droppedLaneCases += 1;
        summary.legacyLaneDrift += laneImpact.legacyLaneDrift.length;
      }
      return summary;
    },
    {
      cases: 0,
      errors: 0,
      identical: 0,
      withDiffs: 0,
      underSelections: 0,
      overSelections: 0,
      laneCheckedCases: 0,
      droppedLanes: 0,
      droppedLaneCases: 0,
      legacyLaneDrift: 0,
    },
  );
}

export const SHADOW_REPORT_VERSION = 1;

export function buildShadowReport({
  kind = SHADOW_REPORT_KIND,
  version = SHADOW_REPORT_VERSION,
  mode,
  targets,
  source,
  status,
  skipReason,
  cases,
  summary,
  error,
}) {
  return {
    kind,
    version,
    mode,
    targets,
    source,
    status,
    ...(skipReason ? { skipReason } : {}),
    ...(summary ? { summary } : {}),
    ...(cases ? { cases } : {}),
    ...(error ? { error } : {}),
  };
}

/**
 * A tool failure must never read as a comparison result. The report keeps a
 * distinct `error` status carrying the message and stack, so a crashed
 * comparison is visible in the artifact and the step summary instead of
 * silently looking like "no differences".
 */
export function buildErrorReport({ mode, targets, source }, error) {
  return buildShadowReport({
    mode,
    targets,
    source,
    status: 'error',
    error: {
      message: error?.message ?? 'unknown error',
      stack: String(error?.stack ?? '')
        .split('\n')
        .slice(0, 10)
        .join('\n'),
    },
  });
}

function renderReason(reason) {
  switch (reason.kind) {
    case 'input-file':
      return `input ${reason.file} (${reason.pattern})`;
    case 'npm-package':
      return `npm package ${reason.package} moved (${reason.file ?? 'package.json'})`;
    case 'moved-ecosystem':
      return `ecosystem ${reason.ecosystem} moved (${reason.file ?? 'dependency metadata'})`;
    case 'external-dependencies':
      return `external dependencies (${reason.file})`;
    case 'project-configuration':
      return `project configuration ${reason.file}`;
    case 'dependent-output':
      return `reads output of ${reason.producer}`;
    case 'lockfile':
      return `lockfile ${reason.file}`;
    case 'custom-hasher':
      return 'custom hasher (always affected)';
    case 'deleted-project-configuration':
      return `deleted project configuration ${reason.file}`;
    default:
      return JSON.stringify(reason);
  }
}

function renderReach(reach) {
  const lines = [];
  if (reach.kind === 'own-file') {
    lines.push(`legacy reach: own changed files: ${reach.ownFiles.join(', ')}`);
  }
  for (const entry of reach.via) {
    const files = entry.metadataTouched
      ? 'dependency metadata (no owned file)'
      : entry.changedFiles.join(', ');
    lines.push(`legacy reach: via ${entry.path.join(' -> ')} (${files})`);
  }
  return lines;
}

function renderCase(caseResult, targets) {
  const lines = [`### ${caseResult.id}`];
  if (caseResult.title) lines.push(`_${caseResult.title}_`);
  if (caseResult.status !== 'ok') {
    lines.push('', `**Comparison error (not a diff result):** \`${caseResult.error.message}\``);
    return lines.join('\n');
  }
  const { underSelection, overSelection, identical } = caseResult.diff;
  if (identical) {
    lines.push('', `Selectors agree on all ${caseResult.legacy.tasks.length} selected tasks.`);
    return lines.join('\n');
  }
  if (underSelection.length > 0) {
    lines.push(
      '',
      `**task-based under-selection (${underSelection.length})** — legacy runs these, task-based drops them:`,
    );
    for (const detail of caseResult.underDetails) {
      lines.push(`- \`${detail.task}\``);
      lines.push(...renderReach(detail.legacyReach).map((line) => `  - ${line}`));
    }
  }
  if (overSelection.length > 0) {
    lines.push(
      '',
      `**task-based over-selection (${overSelection.length})** — not selected by legacy:`,
    );
    for (const detail of caseResult.overDetails) {
      const reasons = detail.reasons.map(renderReason).join('; ');
      lines.push(`- \`${detail.task}\` — ${reasons || 'selected as a dependency'}`);
    }
  }
  const targetNote = targets
    .map(
      (target) =>
        `${target}: legacy ${caseResult.legacy.byTarget[target] ?? 0} / task-based ${caseResult.taskBased.byTarget[target] ?? 0}`,
    )
    .join(', ');
  lines.push('', `_Per-target task counts — ${targetNote}_`);
  const laneImpact = caseResult.laneImpact;
  if (laneImpact) {
    if (laneImpact.droppedLanes.length > 0) {
      lines.push(
        '',
        `**:rotating_light: dropped lanes vs ground truth: ${laneImpact.droppedLanes.join(', ')}**`,
      );
    } else {
      lines.push(
        '',
        '_Lane impact: none — every expected lane stays enabled under task-based selection._',
      );
    }
    if (laneImpact.gainedLanes.length > 0) {
      lines.push(
        '',
        `_Gained lanes (expected false, task-based true): ${laneImpact.gainedLanes.join(', ')}_`,
      );
    }
    if (laneImpact.legacyLaneDrift.length > 0) {
      lines.push(
        '',
        `_Legacy lane drift vs fixture (fixture needs re-review): ${laneImpact.legacyLaneDrift.join(', ')}_`,
      );
    }
  }
  return lines.join('\n');
}

export function renderShadowMarkdown(report) {
  const header = '## Affected selector shadow comparison (non-blocking)';
  if (report.status === 'skipped') {
    return `${header}\n\nSkipped: ${report.skipReason}\n`;
  }
  if (report.status === 'error') {
    const lines = [
      header,
      '',
      ':rotating_light: **Shadow comparison tool error — this is not a comparison result.**',
      '',
      `\`${report.error.message}\``,
    ];
    if (report.error.stack) {
      lines.push('', '```', report.error.stack, '```');
    }
    for (const caseResult of report.cases ?? []) {
      lines.push('', renderCase(caseResult, report.targets));
    }
    return `${lines.join('\n')}\n`;
  }
  const { summary } = report;
  const lines = [
    header,
    '',
    `Selectors compared on \`${report.targets.join(', ')}\`.`,
    `${summary.cases} case(s): ${summary.identical} identical, ${summary.withDiffs} with diffs; ` +
      `**${summary.underSelections} under-selection(s)**, ${summary.overSelections} over-selection(s)` +
      (summary.errors > 0 ? `, ${summary.errors} case error(s)` : '') +
      (summary.laneCheckedCases > 0
        ? `; lane check on ${summary.laneCheckedCases} case(s): **${summary.droppedLanes} dropped lane(s) in ${summary.droppedLaneCases} case(s)**`
        : '') +
      '.',
    '',
    'Under-selection means task-based affected would drop a task legacy affected runs; every entry needs an `--explain` root cause before any selector switch. A dropped lane is a ground-truth violation.',
  ];
  for (const caseResult of report.cases) {
    lines.push('', renderCase(caseResult, report.targets));
  }
  return `${lines.join('\n')}\n`;
}
