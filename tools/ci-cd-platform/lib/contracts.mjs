import { createHash } from 'node:crypto';

export const DELIVERY_MANIFEST_VERSION = 1;
export const LANE_INPUT_VERSION = 1;
export const LANE_RESULT_VERSION = 1;
export const ARTIFACT_MANIFEST_VERSION = 1;
export const PROMOTION_MANIFEST_VERSION = 1;
export const WORKSPACE_RECEIPT_VERSION = 1;
export const LANE_SUMMARY_VERSION = 1;
export const RUN_SUMMARY_VERSION = 1;
export const TIMING_REPORT_VERSION = 1;
export const FAULT_INJECTION_REPORT_VERSION = 1;

const RISK_LEVELS = new Set([
  'docs',
  'package',
  'desktop',
  'runtime',
  'web-flow',
  'root',
  'release',
]);
const LANE_NAMES = new Set([
  'governance',
  'validate',
  'boundary',
  'integration',
  'web',
  'coverage',
  'performance',
]);
const FAILURE_CLASSIFICATIONS = new Set([
  'none',
  'assertion',
  'infrastructure',
  'process-crash',
  'timeout',
  'flaky',
]);

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

export function digest(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(`Contract validation failed: ${message}`);
}

function assertString(value, field) {
  assert(typeof value === 'string' && value.length > 0, `${field} must be a non-empty string`);
}

function assertDigest(value, field) {
  assert(
    typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value),
    `${field} must be a SHA-256 digest`,
  );
}

function assertSelfDigest(value, field) {
  assertDigest(value?.digest, `${field}.digest`);
  const content = { ...value };
  delete content.digest;
  assert(value.digest === digest(content), `${field}.digest does not match content`);
}

function assertStringArray(value, field) {
  assert(Array.isArray(value), `${field} must be an array`);
  assert(
    value.every((entry) => typeof entry === 'string'),
    `${field} must contain strings`,
  );
}

export function validateDeliveryManifest(manifest) {
  assert(manifest && typeof manifest === 'object', 'manifest must be an object');
  assert(manifest.kind === 'delivery-manifest-v1', 'kind must be delivery-manifest-v1');
  assert(manifest.version === DELIVERY_MANIFEST_VERSION, 'unsupported manifest version');
  assertString(manifest.commit, 'commit');
  assertString(manifest.event, 'event');
  assert(typeof manifest.full === 'boolean', 'full must be boolean');
  assert(
    manifest.base === null || typeof manifest.base === 'string',
    'base must be null or string',
  );
  assert(
    manifest.head === null || typeof manifest.head === 'string',
    'head must be null or string',
  );
  assertStringArray(manifest.changedFiles, 'changedFiles');
  assert(manifest.risk && typeof manifest.risk === 'object', 'risk is required');
  assert(RISK_LEVELS.has(manifest.risk.level), `unsupported risk level ${manifest.risk.level}`);
  assertStringArray(manifest.risk.reasons, 'risk.reasons');
  assert(manifest.scope && typeof manifest.scope === 'object', 'scope is required');
  assert(manifest.scope.version === 1, 'scope version must be 1');
  if ('base' in manifest.scope) {
    assert(manifest.scope.base === manifest.base, 'scope.base must match manifest.base');
  }
  if ('head' in manifest.scope) {
    assert(manifest.scope.head === manifest.head, 'scope.head must match manifest.head');
  }
  if ('full' in manifest.scope) {
    assert(manifest.scope.full === manifest.full, 'scope.full must match manifest.full');
  }
  assert(manifest.lanes && typeof manifest.lanes === 'object', 'lanes is required');
  for (const [lane, enabled] of Object.entries(manifest.lanes)) {
    assert(LANE_NAMES.has(lane), `unsupported lane ${lane}`);
    assert(typeof enabled === 'boolean', `lane ${lane} must be boolean`);
  }
  assert(manifest.provenance && typeof manifest.provenance === 'object', 'provenance is required');
  assertString(manifest.provenance.generator, 'provenance.generator');
  assertDigest(manifest.provenance.inputDigest, 'provenance.inputDigest');
  if (manifest.execution !== undefined) {
    const execution = manifest.execution;
    assert(
      manifest.event === 'push' && execution && ['reuse', 'full'].includes(execution.mode),
      'invalid execution policy',
    );
    assert(typeof execution.candidate === 'boolean', 'execution.candidate must be boolean');
    if (execution.mode === 'reuse') {
      assert(manifest.full === false, 'reuse must not claim full audit');
      assert(
        Object.values(manifest.lanes).every((enabled) => enabled === false),
        'reuse must disable ordinary lanes',
      );
      assert(
        Number.isSafeInteger(execution.testRunId) && execution.testRunId > 0,
        'reuse requires test run ID',
      );
      assert(
        Number.isSafeInteger(execution.testRunAttempt) && execution.testRunAttempt > 0,
        'reuse requires run attempt',
      );
      for (const field of ['testHead', 'testedCommit', 'testedTree']) {
        assert(/^[a-f0-9]{40}$/u.test(execution[field]), `reuse requires ${field}`);
      }
      assertDigest(execution.manifestDigest, 'execution.manifestDigest');
      assertDigest(execution.inputsDigest, 'execution.inputsDigest');
    } else {
      assert(manifest.full === true, 'fallback must be full');
      assert(
        [...LANE_NAMES].every((lane) => manifest.lanes[lane] === true),
        'fallback must enable every lane',
      );
    }
  }
  // Keep contracts standalone: runtime bundles import this file without CI planners/history.
  assertStringArray(manifest.scope.unit, 'scope.unit');
  assert(new Set(manifest.scope.unit).size === manifest.scope.unit.length, 'scope.unit duplicates');
  assert(
    Array.isArray(manifest.unitShards) && manifest.unitShards.length === 3,
    'unitShards must contain three jobs',
  );
  const unitTasks = [];
  for (const [index, shard] of manifest.unitShards.entries()) {
    assert(shard?.id === `unit-${index + 1}` && Array.isArray(shard.tasks), 'unitShards IDs/tasks');
    for (const task of shard.tasks) {
      assert(
        task && typeof task.project === 'string' && /^[@\w][\w@/.-]*$/u.test(task.project),
        'Unit task project',
      );
      assert(
        Object.keys(task).every((key) => ['project', 'shard'].includes(key)),
        'unknown Unit task field',
      );
      unitTasks.push(task);
    }
    const splitProjects = shard.tasks.filter((task) => task.shard).map((task) => task.project);
    assert(
      new Set(splitProjects).size === splitProjects.length,
      'split Unit shards of one project must run on different jobs',
    );
  }
  const expectedTasks = manifest.scope.unit
    .filter((project) => project !== 'memoflow')
    .flatMap((project) =>
      project === 'app-vue'
        ? [
            { project, shard: '1/2' },
            { project, shard: '2/2' },
          ]
        : [{ project }],
    );
  assert(
    stableStringify(unitTasks.map(stableStringify).sort()) ===
      stableStringify(expectedTasks.map(stableStringify).sort()),
    'unitShards must cover every Unit task exactly once',
  );
  const web = manifest.webShards;
  assert(web && Array.isArray(web.specs) && Array.isArray(web.shards), 'webShards required');
  assertStringArray(web.specs, 'webShards.specs');
  assert(new Set(web.specs).size === web.specs.length, 'duplicate selected Web spec');
  assert(
    web.specs.every((spec) => /^(?!.*\.\.)(?:[\w-]+\/)*[\w-]+\.spec\.ts$/u.test(spec)),
    'invalid Web spec path',
  );
  assert(typeof web.fallback === 'boolean', 'Web fallback required');
  assert(
    Number.isFinite(web.estimatedTotalMs) && web.estimatedTotalMs >= 0,
    'invalid Web duration',
  );
  assert(
    Number.isSafeInteger(web.shardCount) &&
      web.shardCount >= 0 &&
      web.shardCount === web.shards.length,
    'Web shard count mismatch',
  );
  assert((web.specs.length === 0) === (web.shardCount === 0), 'empty Web plan mismatch');
  const assignedWebSpecs = [];
  for (const [index, shard] of web.shards.entries()) {
    assert(shard.id === `${index + 1}/${web.shardCount}`, 'invalid Web shard ID');
    assertStringArray(shard.specs, 'Web shard specs');
    assert(shard.specs.length > 0, 'empty Web shard');
    assert(
      Number.isFinite(shard.estimatedMs) && shard.estimatedMs > 0,
      'invalid Web shard duration',
    );
    assignedWebSpecs.push(...shard.specs);
  }
  assert(
    stableStringify(assignedWebSpecs.sort()) === stableStringify([...web.specs].sort()),
    'Web plan must cover selected specs exactly once',
  );
  assert(
    web.shards.reduce((sum, shard) => sum + shard.estimatedMs, 0) === web.estimatedTotalMs,
    'Web duration mismatch',
  );
  assert(!manifest.lanes.web || web.shardCount > 0, 'enabled Web lane requires shards');
  assertSelfDigest(manifest, 'manifest');
  return manifest;
}

export function validateLaneInput(input) {
  assert(input && typeof input === 'object', 'lane input must be an object');
  assert(input.kind === 'lane-input-v1', 'kind must be lane-input-v1');
  assert(input.version === LANE_INPUT_VERSION, 'unsupported lane input version');
  assertString(input.lane, 'lane');
  assert(LANE_NAMES.has(input.lane), `unsupported lane ${input.lane}`);
  assertString(input.commit, 'commit');
  assertDigest(input.manifestDigest, 'manifestDigest');
  assertStringArray(input.inputs, 'inputs');
  assertStringArray(input.outputs, 'outputs');
  assert(input.environment && typeof input.environment === 'object', 'environment is required');
  assert(input.cache && typeof input.cache === 'object', 'cache is required');
  assert(input.scope && typeof input.scope === 'object', 'scope is required');
  assert(input.scope.version === 1, 'scope version must be 1');
  assert(input.risk && typeof input.risk === 'object', 'risk is required');
  assert(RISK_LEVELS.has(input.risk.level), `unsupported risk level ${input.risk.level}`);
  assert(
    input.failurePolicy && typeof input.failurePolicy === 'object',
    'failurePolicy is required',
  );
  assertString(input.owner, 'owner');
  assertStringArray(input.capabilities, 'capabilities');
  assert(input.policy && typeof input.policy === 'object', 'policy is required');
  assertSelfDigest(input, 'lane input');
  return input;
}

export function validateLaneResult(result) {
  assert(result && typeof result === 'object', 'lane result must be an object');
  assert(result.kind === 'lane-result-v1', 'kind must be lane-result-v1');
  assert(result.version === LANE_RESULT_VERSION, 'unsupported lane result version');
  assertString(result.lane, 'lane');
  assert(LANE_NAMES.has(result.lane), `unsupported lane ${result.lane}`);
  assertString(result.commit, 'commit');
  assertDigest(result.manifestDigest, 'manifestDigest');
  assert(
    ['success', 'failure', 'cancelled', 'skipped'].includes(result.status),
    'invalid lane status',
  );
  assert(result.failure && typeof result.failure === 'object', 'failure is required');
  assert(
    FAILURE_CLASSIFICATIONS.has(result.failure.classification),
    'invalid failure classification',
  );
  assert(result.timing && typeof result.timing === 'object', 'timing is required');
  assert(result.provenance && typeof result.provenance === 'object', 'provenance is required');
  assertDigest(result.laneInputDigest, 'laneInputDigest');
  assertSelfDigest(result, 'lane result');
  return result;
}

export function validateArtifactManifest(manifest) {
  assert(manifest && typeof manifest === 'object', 'artifact manifest must be an object');
  assert(manifest.kind === 'artifact-manifest-v1', 'kind must be artifact-manifest-v1');
  assert(manifest.version === ARTIFACT_MANIFEST_VERSION, 'unsupported artifact manifest version');
  assertString(manifest.name, 'name');
  assertString(manifest.commit, 'commit');
  assertDigest(manifest.digest, 'digest');
  assertDigest(manifest.sourceManifestDigest, 'sourceManifestDigest');
  assertString(manifest.path, 'path');
  assertString(manifest.createdBy, 'createdBy');
  assert(manifest.toolchain && typeof manifest.toolchain === 'object', 'toolchain is required');
  assert(manifest.provenance && typeof manifest.provenance === 'object', 'provenance is required');
  if (manifest.name === 'api-runtime-closure') {
    assert(
      Array.isArray(manifest.entries) && manifest.entries.length > 0,
      'runtime closure entries are required',
    );
    for (const entry of manifest.entries) {
      assert(entry && typeof entry === 'object', 'runtime closure entry must be an object');
      assertString(entry.name, 'runtime closure entry.name');
      assertString(entry.path, 'runtime closure entry.path');
      assert(
        entry.path.startsWith('packages/') && entry.path.endsWith('/dist'),
        'runtime closure entry must target packages/*/dist',
      );
    }
  }
  return manifest;
}

export function validatePromotionManifest(manifest) {
  assert(manifest && typeof manifest === 'object', 'promotion manifest must be an object');
  assert(manifest.kind === 'promotion-manifest-v1', 'kind must be promotion-manifest-v1');
  assert(manifest.version === PROMOTION_MANIFEST_VERSION, 'unsupported promotion version');
  assertString(manifest.commit, 'commit');
  assertString(manifest.environment, 'environment');
  assertString(manifest.promotedBy, 'promotedBy');
  assert(
    Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0,
    'artifacts are required',
  );
  const names = new Set();
  for (const artifact of manifest.artifacts) {
    assert(artifact && typeof artifact === 'object', 'promotion artifact must be an object');
    assertString(artifact.name, 'promotion artifact.name');
    assertDigest(artifact.digest, `promotion artifact ${artifact.name}.digest`);
    assertDigest(
      artifact.sourceManifestDigest,
      `promotion artifact ${artifact.name}.sourceManifestDigest`,
    );
    assertString(artifact.path, `promotion artifact ${artifact.name}.path`);
    assertString(artifact.createdBy, `promotion artifact ${artifact.name}.createdBy`);
    assert(
      artifact.toolchain && typeof artifact.toolchain === 'object',
      `promotion artifact ${artifact.name}.toolchain is required`,
    );
    assert(
      artifact.provenance && typeof artifact.provenance === 'object',
      `promotion artifact ${artifact.name}.provenance is required`,
    );
    assert(!names.has(artifact.name), `duplicate promotion artifact ${artifact.name}`);
    names.add(artifact.name);
  }
  assertSelfDigest(manifest, 'promotion manifest');
  return manifest;
}

export function validateWorkspaceReceipt(receipt) {
  assert(receipt && typeof receipt === 'object', 'workspace receipt must be an object');
  assert(receipt.kind === 'workspace-receipt-v1', 'kind must be workspace-receipt-v1');
  assert(receipt.version === WORKSPACE_RECEIPT_VERSION, 'unsupported workspace receipt version');
  assertString(receipt.commit, 'commit');
  assert(receipt.runner && typeof receipt.runner === 'object', 'runner is required');
  assert(receipt.toolchain && typeof receipt.toolchain === 'object', 'toolchain is required');
  assertStringArray(receipt.capabilities, 'capabilities');
  assert(receipt.cache && typeof receipt.cache === 'object', 'cache is required');
  assert(receipt.timing && typeof receipt.timing === 'object', 'timing is required');
  assert(receipt.provenance && typeof receipt.provenance === 'object', 'provenance is required');
  assertString(receipt.provenance.generator, 'provenance.generator');
  assertDigest(receipt.provenance.inputDigest, 'provenance.inputDigest');
  assertSelfDigest(receipt, 'workspace receipt');
  return receipt;
}

export function validateLaneSummary(summary) {
  assert(summary && typeof summary === 'object', 'lane summary must be an object');
  assert(summary.kind === 'lane-summary-v1', 'kind must be lane-summary-v1');
  assert(summary.version === LANE_SUMMARY_VERSION, 'unsupported lane summary version');
  assertString(summary.lane, 'lane');
  assert(LANE_NAMES.has(summary.lane), `unsupported lane ${summary.lane}`);
  assertString(summary.commit, 'commit');
  assertDigest(summary.manifestDigest, 'manifestDigest');
  assert(
    ['success', 'failure', 'cancelled', 'skipped'].includes(summary.status),
    'invalid lane summary status',
  );
  assert(summary.timing && typeof summary.timing === 'object', 'timing is required');
  assert(Array.isArray(summary.failures), 'failures must be an array');
  assert(summary.provenance && typeof summary.provenance === 'object', 'provenance is required');
  if (summary.provenance.unitShardId !== undefined) {
    assert(/^unit-[1-3]$/u.test(summary.provenance.unitShardId), 'invalid unit shard identity');
    assertString(summary.provenance.job, 'provenance.job');
    assert(summary.provenance.job === summary.provenance.unitShardId, 'unit shard/job mismatch');
  }
  assertDigest(summary.laneInputDigest, 'laneInputDigest');
  assertSelfDigest(summary, 'lane summary');
  return summary;
}

export function validateRunSummary(summary) {
  assert(summary && typeof summary === 'object', 'run summary must be an object');
  assert(summary.kind === 'run-summary-v1', 'kind must be run-summary-v1');
  assert(summary.version === RUN_SUMMARY_VERSION, 'unsupported run summary version');
  assertString(summary.commit, 'commit');
  assertDigest(summary.manifestDigest, 'manifestDigest');
  assert(
    ['success', 'failure', 'incomplete'].includes(summary.status),
    'invalid run summary status',
  );
  assert(Array.isArray(summary.lanes), 'lanes must be an array');
  assert(summary.timing && typeof summary.timing === 'object', 'timing is required');
  for (const field of ['setupMs', 'executionMs', 'longestLaneMs']) {
    assert(
      Number.isFinite(summary.timing[field]) && summary.timing[field] >= 0,
      `run summary timing.${field} must be non-negative`,
    );
  }
  for (const field of ['wallClockMs', 'runnerMinutes']) {
    assert(
      summary.timing[field] === null ||
        (Number.isFinite(summary.timing[field]) && summary.timing[field] >= 0),
      `run summary timing.${field} must be non-negative or null`,
    );
  }
  assert(summary.provenance && typeof summary.provenance === 'object', 'provenance is required');
  assertSelfDigest(summary, 'run summary');
  return summary;
}

export function validateTimingReport(report) {
  assert(report && typeof report === 'object', 'timing report must be an object');
  assert(report.kind === 'timing-report-v1', 'kind must be timing-report-v1');
  assert(report.version === TIMING_REPORT_VERSION, 'unsupported timing report version');
  assertString(report.profile, 'profile');
  assert(
    Number.isInteger(report.sampleCount) && report.sampleCount > 0,
    'sampleCount must be positive',
  );
  assert(
    Array.isArray(report.samples) && report.samples.length === report.sampleCount,
    'samples must match sampleCount',
  );
  for (const sample of report.samples) {
    assert(sample && typeof sample === 'object', 'timing sample must be an object');
    assertString(sample.commit, 'timing sample.commit');
    assertStringArray(sample.lanes, 'timing sample.lanes');
    for (const field of ['setupMs', 'executionMs', 'longestLaneMs']) {
      assert(
        Number.isFinite(sample[field]) && sample[field] >= 0,
        `timing sample.${field} must be non-negative`,
      );
    }
    for (const field of ['wallClockMs', 'runnerMinutes']) {
      assert(
        sample[field] === null || (Number.isFinite(sample[field]) && sample[field] >= 0),
        `timing sample.${field} must be non-negative or null`,
      );
    }
  }
  assert(report.metrics && typeof report.metrics === 'object', 'timing metrics are required');
  for (const field of ['setupMs', 'executionMs', 'longestLaneMs']) {
    const metric = report.metrics[field];
    assert(
      metric && Number.isFinite(metric.p50) && Number.isFinite(metric.p95),
      `timing metric ${field} is required`,
    );
  }
  for (const field of ['wallClockMs', 'runnerMinutes']) {
    const metric = report.metrics[field];
    assert(
      metric && (metric.p50 === null || Number.isFinite(metric.p50)),
      `timing metric ${field} is required`,
    );
    assert(
      metric && (metric.p95 === null || Number.isFinite(metric.p95)),
      `timing metric ${field} is required`,
    );
  }
  assertSelfDigest(report, 'timing report');
  return report;
}

export function validateFaultInjectionReport(report) {
  assert(report && typeof report === 'object', 'fault injection report must be an object');
  assert(report.kind === 'fault-injection-report-v1', 'kind must be fault-injection-report-v1');
  assert(
    report.version === FAULT_INJECTION_REPORT_VERSION,
    'unsupported fault injection report version',
  );
  assert(report.status === 'passed', 'fault injection report must pass');
  assert(
    Array.isArray(report.scenarios) && report.scenarios.length > 0,
    'fault injection scenarios are required',
  );
  for (const scenario of report.scenarios) {
    assert(scenario && typeof scenario === 'object', 'fault injection scenario must be an object');
    assertString(scenario.name, 'fault injection scenario.name');
    assert(
      scenario.observed === 'fail-closed',
      `fault injection scenario ${scenario.name} did not fail closed`,
    );
  }
  assert(
    report.provenance && typeof report.provenance === 'object',
    'fault injection provenance is required',
  );
  assertSelfDigest(report, 'fault injection report');
  return report;
}

export function buildLaneInput({
  lane,
  commit,
  manifestDigest,
  definition,
  scope,
  risk,
  runId = null,
  policy = {},
}) {
  return {
    kind: 'lane-input-v1',
    version: LANE_INPUT_VERSION,
    lane,
    commit,
    manifestDigest,
    inputs: definition.inputs,
    outputs: definition.outputs,
    environment: definition.environment,
    cache: definition.cache,
    failurePolicy: definition.failurePolicy,
    owner: definition.owner,
    capabilities: definition.capabilities,
    scope,
    risk,
    policy,
    runId,
  };
}

export function buildProvenance({ generator, input }) {
  return {
    generator,
    inputDigest: digest(input),
  };
}
