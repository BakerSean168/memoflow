import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  analyzeE2EOwnership,
  analyzeE2ERetirement,
  loadE2EOwnership,
  loadE2ERetirement,
} from '../lib/e2e-governance.mjs';
import { buildInventory } from '../lib/test-inventory.mjs';

const root = process.cwd();
const inventory = await buildInventory(root);
const ownership = await loadE2EOwnership(root);
const retirement = await loadE2ERetirement(root);

test('repository E2E ownership is execution-aware and complete', () => {
  assert.equal(inventory.version, 3);
  assert.deepEqual(inventory.e2eGovernance.issues, []);
  assert.equal(inventory.e2eGovernance.countsByLane.required, 22);
  assert.equal(inventory.e2eGovernance.countsByLane.nightly, 5);
  assert.equal(inventory.e2eGovernance.countsByLane.debug, undefined);
  assert.equal(inventory.e2eGovernance.countsByRole.canonical, 25);
  assert.equal(inventory.e2eGovernance.countsByRole.diagnostic, undefined);

  const goalWorkflow = inventory.primary.find(
    (entry) => entry.path === 'apps/web/e2e/ai/goal-workflow.spec.ts',
  );
  assert.equal(goalWorkflow?.collectors.length, 2);
  assert.equal(goalWorkflow?.e2eOwnership.primaryCollector, 'apps/web/playwright.config.ts');

  const goalReference = inventory.collectors.find(
    (collector) => collector.id === 'apps/web/playwright.goal-reference.config.ts',
  );
  assert.equal(goalReference?.e2eOwnership.execution.kind, 'manual');
  assert.equal(goalReference?.e2eOwnership.lane, 'reference');
});

test('repository retirement contract blocks retired E2E surfaces', () => {
  assert.deepEqual(inventory.e2eRetirement.issues, []);
  assert.equal(inventory.e2eRetirement.retiredSpecCount, 20);
  assert.equal(inventory.e2eRetirement.forbiddenReferenceCount, 3);
});

test('collector-only Playwright configs fail closed without an execution contract', async () => {
  const contract = structuredClone(ownership);
  delete contract.collectors['apps/web/playwright.goal-reference.config.ts'];

  const governance = await analyzeE2EOwnership(root, inventory, contract);
  assert.ok(
    governance.issues.some(
      (issue) =>
        issue.collector === 'apps/web/playwright.goal-reference.config.ts' &&
        issue.reason === 'missing-collector-ownership',
    ),
  );
});

test('same-suite E2E overlaps require one explicit primary collector', async () => {
  const contract = structuredClone(ownership);
  contract.specs['apps/web/e2e/ai/goal-workflow.spec.ts'].primaryCollector =
    'apps/web/playwright.audit.config.ts';

  const governance = await analyzeE2EOwnership(root, inventory, contract);
  assert.ok(
    governance.issues.some(
      (issue) =>
        issue.path === 'apps/web/e2e/ai/goal-workflow.spec.ts' &&
        issue.reason === 'primary-collector-does-not-collect-spec',
    ),
  );
});

test('Nx execution contracts must bind the declared Playwright collector', async () => {
  const contract = structuredClone(ownership);
  contract.collectors['apps/web/playwright.audit.config.ts'].execution.target = 'web:e2e:sync';

  const governance = await analyzeE2EOwnership(root, inventory, contract);
  assert.ok(
    governance.issues.some(
      (issue) =>
        issue.collector === 'apps/web/playwright.audit.config.ts' &&
        issue.reason === 'nx-target-does-not-bind-collector',
    ),
  );
});

test('retired spec paths cannot be reintroduced as active E2E files', async () => {
  const contract = structuredClone(retirement);
  contract.retiredSpecs.push({
    path: 'apps/web/e2e/account/account-management.spec.ts',
    reason: 'test fixture for governance validation',
  });

  const governance = await analyzeE2ERetirement(root, contract);
  assert.ok(
    governance.issues.some(
      (issue) =>
        issue.path === 'apps/web/e2e/account/account-management.spec.ts' &&
        issue.reason === 'retired-spec-reintroduced',
    ),
  );
});

test('retired E2E references are scanned from active browser tests', async () => {
  const contract = structuredClone(retirement);
  contract.forbiddenReferences.push({
    id: 'governance-fixture-current-add-context',
    needle: 'ai-chat-add-context',
    reason: 'test fixture for governance validation',
  });

  const governance = await analyzeE2ERetirement(root, contract);
  assert.ok(
    governance.issues.some(
      (issue) =>
        issue.id === 'governance-fixture-current-add-context' &&
        issue.reason === 'retired-reference' &&
        issue.path === 'apps/web/e2e/local-docker/core-product-phase-e.spec.ts',
    ),
  );
});

test('one-off browser debugging stays on the canonical Web Flow instead of a debug primary lane', async () => {
  const [webProjectSource, packageSource] = await Promise.all([
    readFile('apps/web/project.json', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);
  const webProject = JSON.parse(webProjectSource);
  const packageJson = JSON.parse(packageSource);

  assert.equal(webProject.targets['e2e:debug'], undefined);
  assert.equal(packageJson.scripts['e2e:debug'], 'pnpm nx run web:e2e --configuration=debug');
});

test('Nightly audit collects the full failure map without enabling parallel workers', async () => {
  const source = await readFile('apps/web/playwright.audit.config.ts', 'utf8');
  assert.match(source, /maxFailures:\s*0/u);
  assert.doesNotMatch(source, /workers:\s*[2-9]/u);
});
