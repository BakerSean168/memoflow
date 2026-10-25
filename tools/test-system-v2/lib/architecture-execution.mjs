import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EXECUTION_PHASES } from './architecture-taxonomy.mjs';

function stage(status, basis) {
  return { status, basis };
}

export async function loadExecutionEvidence(root, inventory) {
  const [ci, nightly, releaseAssets, desktopUpdate] = await Promise.all([
    fs.readFile(path.resolve(root, '.github/workflows/ci.yml'), 'utf8'),
    fs.readFile(path.resolve(root, '.github/workflows/nightly-audit.yml'), 'utf8'),
    fs.readFile(path.resolve(root, '.github/workflows/release-assets.yml'), 'utf8'),
    fs.readFile(path.resolve(root, '.github/workflows/desktop-update-e2e.yml'), 'utf8'),
  ]);
  // Release ownership is a separate lane from PR and Nightly. Only accept
  // actual spec arguments of the Windows installed-E2E Playwright invocation.
  const installedCommand =
    desktopUpdate.match(
      /pnpm exec playwright test ([\s\S]*?) --config playwright\.config\.ts --workers=1/u,
    )?.[1] ?? '';
  const windowsInstalledSpecs = new Set(
    [...installedCommand.matchAll(/e2e\/[a-z0-9/_-]+\.spec\.mts/gu)].map(
      (match) => 'apps/desktop/' + match[0],
    ),
  );
  const windowsReleaseWorkflow =
    releaseAssets.includes('uses: ./.github/workflows/desktop-update-e2e.yml') &&
    desktopUpdate.includes('runs-on: windows-latest') &&
    desktopUpdate.includes('if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }');
  const collectorMap = new Map();
  await Promise.all(
    (inventory.collectors ?? []).map(async (collector) => {
      const decorated = { ...collector };
      if (
        collector.runner === 'vitest' &&
        collector.id.includes('vitest') &&
        /\.(?:[cm]?[jt]s)$/u.test(collector.id)
      ) {
        try {
          const config = await fs.readFile(path.resolve(root, collector.id), 'utf8');
          decorated.configuredVitestEnvironment =
            config.match(/\benvironment:\s*['"](node|jsdom|happy-dom)['"]/u)?.[1] ?? null;
        } catch {
          decorated.configuredVitestEnvironment = null;
        }
      }
      collectorMap.set(collector.id, decorated);
    }),
  );
  return {
    collectors: collectorMap,
    capabilities: {
      pr: /\bpull_request:/u.test(ci.slice(0, 800)),
      main: /\bpush:/u.test(ci.slice(0, 800)) && /\bbranches:\s*\[main\]/u.test(ci.slice(0, 800)),
      nightly: /\bschedule:/u.test(nightly.slice(0, 800)),
      bySuite: {
        unit: ci.includes('run-unit-shard.mjs'),
        integration: ci.includes('test:integration'),
        smoke: ci.includes('test:smoke'),
        'boundary-ipc': ci.includes('has_boundary') && ci.includes('has_desktop_boundary'),
        'boundary-main': ci.includes('has_boundary') && ci.includes('has_desktop_boundary'),
        perf: ci.includes('test:perf'),
        governance: ci.includes('governance-check'),
      },
      nightlyCoverage: nightly.includes('test:coverage'),
      windowsInstalledSpecs: windowsReleaseWorkflow ? windowsInstalledSpecs : new Set(),
      nightlyCoverageProjects: new Set(
        (nightly.match(/GOVERNED_COVERAGE_PROJECTS:\s*['"]([^'"]+)['"]/u)?.[1] ?? '')
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    },
  };
}

export function determineExecutionPhases(entry, evidence) {
  const primary = entry.e2eOwnership?.primaryCollector ?? entry.collectors?.[0];
  const collector = evidence.collectors.get(primary);
  const suite = entry.primarySuite;
  const phases = Object.fromEntries(
    EXECUTION_PHASES.map((phase) => [phase, stage('not-confirmed', 'no verified stage binding')]),
  );
  // Available means that a runner is declared; it does NOT mean that prerequisites exist locally.
  phases.local = stage(
    'available',
    'primary collector/target is configured; prerequisites may apply',
  );
  if (suite === 'e2e') {
    const automation = collector?.e2eOwnership?.automation ?? [];
    const hasCi = automation.some((binding) => binding.workflow === '.github/workflows/ci.yml');
    const hasNightly = automation.some(
      (binding) => binding.workflow === '.github/workflows/nightly-audit.yml',
    );
    if (hasCi && evidence.capabilities.pr) {
      phases.pr = stage(
        'conditional',
        'declared E2E collector/workflow binding; selected specs may differ',
      );
    }
    if (hasCi && evidence.capabilities.main) {
      phases.main = stage(
        'conditional',
        'declared CI push-main workflow; execution/reuse may differ',
      );
    }
    if (hasNightly && evidence.capabilities.nightly) {
      phases.nightly = stage('conditional', 'declared scheduled E2E collector binding');
    }
    if (evidence.capabilities.windowsInstalledSpecs?.has(entry.path)) {
      phases.release = stage(
        'conditional',
        'release-assets.yml invokes desktop-update-e2e.yml Windows installed Playwright spec; a run receipt is still required',
      );
    }
  } else {
    const ciSelectsSuite = evidence.capabilities.bySuite[suite] === true;
    if (ciSelectsSuite && evidence.capabilities.pr) {
      phases.pr = stage('conditional', 'CI affected/scope suite policy, not a per-file receipt');
    }
    if (ciSelectsSuite && evidence.capabilities.main) {
      phases.main = stage('conditional', 'CI push-main scope policy, may reuse PR evidence');
    }
    if (
      suite === 'unit' &&
      entry.measurementCollectors?.length &&
      evidence.capabilities.nightlyCoverageProjects?.has(entry.path.split('/')[1]) &&
      evidence.capabilities.nightly &&
      evidence.capabilities.nightlyCoverage
    ) {
      phases.nightly = stage(
        'conditional',
        'nightly governed coverage measurement, not a full unit suite',
      );
    }
  }
  // Release verification is artifact-focused. Never infer a test's release inclusion
  // solely because the repository has a Release workflow.
  return phases;
}
