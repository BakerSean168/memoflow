import { classifyCapabilities } from './risk.mjs';

/**
 * Capability plan for a run (VNext Q2). The boolean `lanes` map stays the
 * scheduling contract for the seven platform lanes; `laneDetails` is the
 * richer, auditable plan across every quality capability: whether it is
 * required, which changed files motivate it, which targets execute it, and —
 * when it is not required — why not. Stage gates (ci-check) verify the
 * capabilities their stage actually wires; a required capability whose
 * producer reports anything but success fails the gate, so a conditionally
 * skipped GitHub job cannot fake green.
 */
export const CAPABILITY_NAMES = [
  'governance',
  'fmt',
  'lint',
  'typecheck',
  'unit',
  'componentBrowser',
  'contract',
  'boundary',
  'integration',
  'validate',
  'web',
  'coverage',
  'performance',
];

function detail(required, files, targets, skipReason) {
  return { required, files, targets, skipReason: required ? null : skipReason };
}

export function buildLaneDetails({ lanes, changedFiles, scope, full = false }) {
  const caps = classifyCapabilities({ changedFiles, scope });
  const byFiles = (cap, targets, reason) =>
    caps[cap].files.length > 0 || full
      ? detail(true, caps[cap].files, targets, null)
      : detail(false, [], targets, reason);
  const byProjects = (cap, targets, reason) =>
    (caps[cap].projects ?? []).length > 0 || full
      ? detail(true, [], targets, null)
      : detail(false, [], targets, reason);
  const byLane = (lane, targets, reason) =>
    detail(lanes[lane] === true, [], targets, reason);
  return {
    governance: detail(true, [], ['governance'], null),
    fmt: byFiles('fmt', ['quality:fmt'], 'no formattable files changed'),
    lint: byFiles('lint', ['lint'], 'no lintable files changed'),
    typecheck: byFiles('typecheck', ['typecheck'], 'no typed source files changed'),
    unit: byProjects('unit', ['test'], 'no unit-affected projects'),
    componentBrowser: byFiles(
      'componentBrowser',
      ['ui-storybook:test:interaction'],
      'no storybook stories or storybook app files changed',
    ),
    contract: byFiles('contract', ['test:contract'], 'no contract surface changed'),
    boundary: byLane('boundary', ['test:boundary'], 'no boundary-affected projects'),
    integration: byLane('integration', ['test:integration'], 'no integration-affected projects'),
    validate: byLane('validate', ['validate'], 'validation not required for this change'),
    web: detail(lanes.web === true, caps.web.files, ['web:e2e'], 'no web flow risk selected'),
    coverage: byLane('coverage', ['test:coverage'], 'coverage is not selected for this run'),
    performance: byLane('performance', ['test:perf'], 'performance is not selected for this run'),
  };
}
