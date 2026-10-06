import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(`../../../${file}`, import.meta.url), 'utf8');

test('candidate publication is a successful-main-CI-only build-once path', async () => {
  const workflow = await read('.github/workflows/candidate-publish.yml');
  assert.match(workflow, /workflow_run:/u);
  assert.match(workflow, /workflows: \[CI\]/u);
  assert.match(workflow, /branches: \[main\]/u);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/u);
  assert.match(workflow, /workflow_run\.event == 'push'/u);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/u);
  assert.doesNotMatch(workflow, /pull_request:/u);
  assert.match(workflow, /name: Download exact CI build closure/u);
  assert.match(workflow, /run-id: \$\{\{ needs\.resolve\.outputs\.ci_run_id \}\}/u);
  assert.match(workflow, /USE_PREBUILT_ARTIFACT=1/u);
});

test('candidate workflow publishes exactly Web API Migrator plus a manifest-bound runtime artifact', async () => {
  const workflow = await read('.github/workflows/candidate-publish.yml');
  for (const component of ['web', 'api', 'migrator']) {
    assert.match(workflow, new RegExp(`component: ${component}`));
    assert.match(workflow, new RegExp(`memoflow-${component}`));
  }
  assert.match(workflow, /candidate-set-v1\.json/u);
  assert.match(workflow, /candidate-manifest\.mjs --validate/u);
  assert.match(workflow, /memoflow-staging-runtime/u);
  assert.match(workflow, /Dockerfile\.runtime/u);
  assert.match(workflow, /Login to ACR/u);
  assert.match(workflow, /Login to GHCR/u);
  assert.match(workflow, /Verify dual-registry digest and OCI revision parity/u);
});

test('staging promotion is freshness-gated and moves only coherent digest identities', async () => {
  const workflow = await read('.github/workflows/candidate-publish.yml');
  assert.match(workflow, /Recheck main HEAD immediately before staging mutation/u);
  assert.match(workflow, /git ls-remote/u);
  assert.match(workflow, /eligible=false/u);
  assert.match(
    workflow,
    /imagetools create --prefer-index=false --tag "\$repo:staging-latest" "\$repo@\$digest"/u,
  );
  assert.match(workflow, /Verify coherent staging-latest digests/u);
  assert.doesNotMatch(workflow, /prod-latest/u);
  assert.doesNotMatch(workflow, /ssh /u);
  assert.doesNotMatch(workflow, /gh release/u);
});

test('candidate workflow pins every third-party Action to an immutable commit', async () => {
  const workflow = await read('.github/workflows/candidate-publish.yml');
  const uses = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gmu)].map(
    (match) => match[1],
  );
  assert.ok(uses.length > 0);
  for (const action of uses) {
    if (action.startsWith('./')) continue;
    assert.match(action, /@[0-9a-f]{40}$/u, `un-pinned action: ${action}`);
  }
});

test('China registry login is bounded-retry across delivery workflows', async () => {
  const [action, candidate, production, release, mirrors] = await Promise.all([
    read('.github/actions/registry-login/action.yml'),
    read('.github/workflows/candidate-publish.yml'),
    read('.github/workflows/deploy-production.yml'),
    read('.github/workflows/publish-images.yml'),
    read('.github/workflows/mirror-runtime-images.yml'),
  ]);

  const pinnedLoginAction = /uses: docker\/login-action@dbcb813823bdd20940b903addbd779551569679f/u;
  assert.equal((action.match(new RegExp(pinnedLoginAction.source, 'gu')) ?? []).length, 3);
  assert.match(action, /continue-on-error: true/u);
  assert.match(action, /run: sleep 5/u);
  assert.match(action, /run: sleep 15/u);
  assert.match(action, /steps\.login-1\.outcome == 'failure'/u);
  assert.match(action, /steps\.login-2\.outcome == 'failure'/u);

  const workflows = [candidate, production, release, mirrors];
  const retryUses = workflows.reduce(
    (count, workflow) =>
      count + (workflow.match(/uses: \.\/\.github\/actions\/registry-login/gu) ?? []).length,
    0,
  );
  assert.equal(retryUses, 6);
  for (const workflow of workflows) {
    assert.doesNotMatch(workflow, /name: Login to ACR\s*\n\s*uses: docker\/login-action/u);
  }
});
