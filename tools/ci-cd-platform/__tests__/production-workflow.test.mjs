import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readRepoFile = (path) => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

function workflowStep(workflow, name) {
  const marker = `- name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow step not found: ${name}`);
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, next < 0 ? workflow.length : next);
}

test('production selector is explicit, Published-release-only, main-bound, and environment-gated', async () => {
  const workflow = await readRepoFile('.github/workflows/deploy-production.yml');
  assert.match(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /^  push:/mu);
  assert.doesNotMatch(workflow, /^  workflow_run:/mu);
  assert.match(workflow, /environment:\s*production/u);
  assert.match(workflow, /Require selector source to be current main/u);
  assert.match(workflow, /test "\$control_plane_sha" = "\$current_main"/u);
  assert.match(workflow, /isDraft/u);
  assert.match(workflow, /isPrerelease/u);
  assert.match(workflow, /test .*\.isDraft.* = false/u);
  assert.match(workflow, /test .*\.isPrerelease.* = false/u);
  assert.match(workflow, /git\/ref\/tags\/\$RELEASE_TAG/u);
  assert.match(workflow, /Recheck selector control plane remains current main before mutation/u);
  assert.match(workflow, /git ls-remote .*refs\/heads\/main/u);
  assert.match(workflow, /test "\$current_main" = "\$CONTROL_PLANE_SHA"/u);
  assert.match(workflow, /actions\/runs\/\$ci_run_id/u);
  assert.match(workflow, /\.head_branch.*main/u);
  assert.match(workflow, /\.event.*push/u);
  assert.match(workflow, /\.conclusion.*success/u);
  assert.doesNotMatch(workflow, /\bssh\b/u);
});

test('production selector binds runtime dependencies to exact release source, not selector HEAD', async () => {
  const workflow = await readRepoFile('.github/workflows/deploy-production.yml');
  const checkout = workflowStep(
    workflow,
    'Checkout exact release source for runtime dependency identity',
  );
  const buildSet = workflowStep(workflow, 'Build production-set from release-owned runtime pins');
  assert.match(checkout, /ref: \$\{\{ steps\.release\.outputs\.release_sha \}\}/u);
  assert.match(checkout, /path: release-source/u);
  assert.match(buildSet, /git -C release-source rev-parse HEAD/u);
  assert.match(
    buildSet,
    /--runtime-mirrors release-source\/tools\/ci-cd-platform\/runtime-image-mirrors\.json/u,
  );
  assert.match(
    buildSet,
    /cp -a release-source\/docker\/powersync reports\/production\/release-runtime\/docker\/powersync/u,
  );
  assert.match(buildSet, /--control-plane-sha "\$CONTROL_PLANE_SHA"/u);
  const runtimeDockerfile = await readRepoFile('deployment/production/Dockerfile.runtime');
  assert.match(
    runtimeDockerfile,
    /COPY reports\/production\/release-runtime\/docker\/powersync \/runtime\/production\/docker\/powersync/u,
  );
  assert.match(
    runtimeDockerfile,
    /COPY deployment\/production\/install-production-deploy-watch\.sh \/runtime\/production\/install-production-deploy-watch\.sh/u,
  );
  assert.doesNotMatch(runtimeDockerfile, /^COPY docker\/powersync/mu);
  const installer = await readRepoFile('deployment/production/install-production-deploy-watch.sh');
  assert.match(installer, /SOURCE_DIR=\$\(cd .*dirname/u);
  assert.match(installer, /\$SOURCE_DIR\/production-deploy-watch\.sh/u);
  assert.doesNotMatch(installer, /deployment\/production\/production-deploy-watch\.sh/u);
});

test('production selector moves only one coherent control pointer and never rebuilds application images', async () => {
  const workflow = await readRepoFile('.github/workflows/deploy-production.yml');
  assert.equal((workflow.match(/docker\/build-push-action@[0-9a-f]{40}/gu) ?? []).length, 1);
  assert.match(
    workflow,
    /Reuse immutable production control artifact only when both registries agree/u,
  );
  assert.match(workflow, /immutable production control artifact exists in only one registry/u);
  assert.match(workflow, /if: steps\.existing\.outputs\.reuse != 'true'/u);
  assert.ok(workflow.includes('REUSED_DIGEST: ${{ steps.existing.outputs.digest }}'));
  assert.ok(workflow.includes('control_digest="${REUSED_DIGEST:-$BUILD_DIGEST}"'));
  assert.match(workflow, /file: deployment\/production\/Dockerfile\.runtime/u);
  assert.match(workflow, /memoflow-production-runtime/u);
  assert.match(workflow, /production-selected/u);
  assert.match(workflow, /--prefer-index=false/u);
  assert.doesNotMatch(workflow, /Dockerfile\.api|Dockerfile\.web/u);
  assert.doesNotMatch(workflow, /memoflow-(?:api|web|migrator):production-selected/u);
});

test('production selector verifies release and runtime digest parity before control-pointer mutation', async () => {
  const workflow = await readRepoFile('.github/workflows/deploy-production.yml');
  const verify = workflowStep(
    workflow,
    'Verify immutable release and runtime digests before selection',
  );
  const mutate = workflowStep(
    workflow,
    'Move the single coherent production-selected control pointer',
  );
  assert.match(verify, /distributions\.china\.repository/u);
  assert.match(verify, /distributions\.global\.repository/u);
  assert.match(verify, /imagetools inspect/u);
  assert.match(verify, /postgres redis powersync caddy/u);
  assert.match(mutate, /memoflow-production-runtime/u);
  assert.match(mutate, /registry-operation-retry\.sh docker buildx imagetools create/u);
  assert.match(mutate, /registry-operation-retry\.sh docker buildx imagetools inspect/u);
  assert.ok(
    workflow.indexOf('Verify immutable release and runtime digests before selection') <
      workflow.indexOf('Move the single coherent production-selected control pointer'),
  );
  assert.ok(
    workflow.indexOf('Recheck release remains Published immediately before mutation') <
      workflow.indexOf('Move the single coherent production-selected control pointer'),
  );
});

test('production workflow external Actions are immutable-SHA pinned', async () => {
  const workflow = await readRepoFile('.github/workflows/deploy-production.yml');
  const refs = [...workflow.matchAll(/uses:\s+([^./\s][^@\s]+)@([^\s#]+)/gu)];
  assert.ok(refs.length > 0);
  for (const [, action, ref] of refs) {
    assert.match(ref, /^[0-9a-f]{40}$/u, `${action} must use a full immutable SHA`);
  }
});

test('Docker build context admits only production control evidence required by the runtime image', async () => {
  const dockerignore = await readRepoFile('.dockerignore');
  assert.match(dockerignore, /!reports\/production\/production-set-v1\.json/u);
  assert.match(dockerignore, /!reports\/production\/production-set-v1\.sha256/u);
  assert.match(dockerignore, /!reports\/production\/release-runtime\/docker\/powersync\/\*\*/u);
});

test('production bootstrap never shell-sources the Compose secret env', async () => {
  const [readme, installer] = await Promise.all([
    readRepoFile('deployment/production/README.md'),
    readRepoFile('deployment/production/install-production-deploy-watch.sh'),
  ]);
  assert.doesNotMatch(readme, /source \/opt\/memoflow\/\.env\.production\.local/u);
  assert.match(readme, /sed -n 's\/\^REGISTRY=\/\/p'/u);
  assert.match(readme, /sed -n 's\/\^IMAGE_NAMESPACE=\/\/p'/u);
  assert.doesNotMatch(installer, /source .*production/u);
  assert.match(installer, /read_env_key/u);
});

test('canonical production compose has no mutable application fallback or Watchtower authority', async () => {
  const compose = await readRepoFile('deployment/production/docker-compose.production.yml');
  for (const name of [
    'API_IMAGE',
    'MIGRATOR_IMAGE',
    'WEB_IMAGE',
    'POSTGRES_IMAGE',
    'REDIS_IMAGE',
    'POWERSYNC_IMAGE',
    'CADDY_IMAGE',
  ]) {
    assert.match(compose, new RegExp(`\\$\\{${name}:\\?set ${name}\\}`));
  }
  assert.doesNotMatch(compose, /prod-latest/u);
  assert.doesNotMatch(compose, /watchtower/iu);
  assert.doesNotMatch(compose, /\$\{REGISTRY/u);
});
