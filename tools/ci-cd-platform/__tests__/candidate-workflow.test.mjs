import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

test('candidate ACR login retries only transient registry transport failures', async () => {
  const [workflow, action, loginScript] = await Promise.all([
    read('.github/workflows/candidate-publish.yml'),
    read('.github/actions/docker-registry-login-retry/action.yml'),
    read('.github/actions/docker-registry-login-retry/login.sh'),
  ]);
  const acrBlocks = [...workflow.matchAll(/- name: Login to ACR[\s\S]*?(?=\n\s+- name:)/gmu)].map(
    (match) => match[0],
  );

  assert.equal(acrBlocks.length, 3);
  for (const block of acrBlocks) {
    assert.match(block, /uses: \.\/\.github\/actions\/docker-registry-login-retry/u);
    assert.doesNotMatch(block, /docker\/login-action/u);
  }
  assert.match(action, /bash "\$GITHUB_ACTION_PATH\/login\.sh"/u);
  assert.match(
    loginScript,
    /"\$DOCKER_BIN" login "\$REGISTRY" --username "\$USERNAME" --password-stdin/u,
  );
  assert.match(loginScript, /connection reset by peer/u);
  assert.match(loginScript, /TLS handshake timeout/u);
  assert.match(loginScript, /status code: \(429\|5\[0-9\]\{2\}\)/u);
  assert.match(loginScript, /unauthorized\|authentication required\|denied/u);
  assert.match(loginScript, /MAX_ATTEMPTS/u);
  assert.match(loginScript, /delay_seconds=\$\(\(delay_seconds \* 3\)\)/u);
});

test('registry login retry behavior preserves failure semantics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'memoflow-registry-login-'));
  const fakeDocker = join(root, 'docker');
  const countFile = join(root, 'count');
  const loginScript = fileURLToPath(
    new URL('../../../.github/actions/docker-registry-login-retry/login.sh', import.meta.url),
  );

  try {
    await writeFile(
      fakeDocker,
      `#!/usr/bin/env bash
set -euo pipefail
cat >/dev/null
count=0
if [[ -f "$FAKE_COUNT_FILE" ]]; then count="$(cat "$FAKE_COUNT_FILE")"; fi
count=$((count + 1))
printf '%s' "$count" > "$FAKE_COUNT_FILE"
case "$FAKE_MODE" in
  transient-then-success)
    if (( count >= 2 )); then exit 0; fi
    echo 'read: connection reset by peer' >&2
    exit 1
    ;;
  transient-always)
    echo 'net/http: TLS handshake timeout' >&2
    exit 1
    ;;
  auth)
    echo 'unauthorized: authentication required' >&2
    exit 1
    ;;
  unknown)
    echo 'invalid local Docker configuration' >&2
    exit 1
    ;;
esac
`,
      'utf8',
    );
    await chmod(fakeDocker, 0o755);

    const run = async (mode) => {
      await rm(countFile, { force: true });
      const result = spawnSync('bash', [loginScript], {
        encoding: 'utf8',
        env: {
          ...process.env,
          DOCKER_BIN: fakeDocker,
          FAKE_COUNT_FILE: countFile,
          FAKE_MODE: mode,
          REGISTRY: 'registry.example.test',
          USERNAME: 'ci-user',
          PASSWORD: 'secret',
          MAX_ATTEMPTS: '3',
          INITIAL_DELAY_SECONDS: '0',
        },
      });
      return {
        ...result,
        attempts: Number(await readFile(countFile, 'utf8')),
      };
    };

    const recovered = await run('transient-then-success');
    assert.equal(recovered.status, 0);
    assert.equal(recovered.attempts, 2);

    const auth = await run('auth');
    assert.equal(auth.status, 1);
    assert.equal(auth.attempts, 1);
    assert.match(auth.stderr, /non-retryable authentication error/u);

    const unknown = await run('unknown');
    assert.equal(unknown.status, 1);
    assert.equal(unknown.attempts, 1);
    assert.match(unknown.stderr, /non-retryable error/u);

    const exhausted = await run('transient-always');
    assert.equal(exhausted.status, 1);
    assert.equal(exhausted.attempts, 3);
    assert.match(exhausted.stderr, /exhausted 3 attempts/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
