import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createCandidateSet } from '../candidate-manifest.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const watcherPath = path.join(repoRoot, 'deployment/staging/staging-deploy-watch.sh');
const revision = 'f'.repeat(40);
const tag = `sha-${revision}`;
const digest = (char) => `sha256:${char.repeat(64)}`;
const runtimeMirrorConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'tools/ci-cd-platform/runtime-image-mirrors.json'), 'utf8'),
);
const runtimeMirrorDigest = (name) => {
  const entry = runtimeMirrorConfig.images.find((image) => image.name === name);
  assert.ok(entry, `missing runtime mirror fixture for ${name}`);
  return entry.mirrorDigest ?? entry.source.split('@')[1];
};

function candidate() {
  const component = (name, char) => ({
    tag,
    digest: digest(char),
    revision,
    distributions: {
      china: {
        repository: `registry.example/memoflow/memoflow-${name}`,
        tag,
        digest: digest(char),
      },
      global: {
        repository: `ghcr.io/example/memoflow-${name}`,
        tag,
        digest: digest(char),
      },
    },
  });
  return createCandidateSet({
    gitSha: revision,
    ciRunId: '123',
    deliveryManifestDigest: digest('d'),
    ciEvidence: {
      kind: 'ci-chain-v1',
      commit: revision,
      tree: 'e'.repeat(40),
      ciRunId: 123,
      deliveryManifestDigest: digest('d').slice(7),
      testEvidence: { testRunId: 123, testedCommit: revision, testedTree: 'e'.repeat(40) },
      buildArtifactId: 123,
      buildArtifactDigest: `sha256:${'f'.repeat(64)}`,
    },
    images: {
      web: component('web', '1'),
      api: component('api', '2'),
      migrator: component('migrator', '3'),
    },
    generatedAt: '2026-09-05T00:00:00.000Z',
  });
}

function runWatcher({
  apiRevision = revision,
  apiDigest = digest('2'),
  missingApiRevision = false,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-staging-watch-'));
  const bin = path.join(root, 'bin');
  const state = path.join(root, 'state');
  const runtimeRoot = path.join(root, 'runtime');
  const runtimeSource = path.join(root, 'runtime-source');
  const config = path.join(root, 'staging-channel.env');
  const secret = path.join(root, 'staging.env');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(runtimeSource, 'docker/powersync'), { recursive: true });
  fs.mkdirSync(path.join(runtimeSource, 'tools/ci-cd-platform/lib'), { recursive: true });
  fs.mkdirSync(path.join(runtimeSource, 'systemd'), { recursive: true });
  fs.writeFileSync(
    path.join(runtimeSource, 'candidate-set-v1.json'),
    `${JSON.stringify(candidate(), null, 2)}\n`,
  );
  fs.copyFileSync(
    path.join(repoRoot, 'tools/ci-cd-platform/candidate-manifest.mjs'),
    path.join(runtimeSource, 'tools/ci-cd-platform/candidate-manifest.mjs'),
  );
  fs.copyFileSync(
    path.join(repoRoot, 'tools/ci-cd-platform/runtime-image-mirrors.json'),
    path.join(runtimeSource, 'tools/ci-cd-platform/runtime-image-mirrors.json'),
  );
  fs.copyFileSync(
    path.join(repoRoot, 'tools/ci-cd-platform/lib/contracts.mjs'),
    path.join(runtimeSource, 'tools/ci-cd-platform/lib/contracts.mjs'),
  );
  for (const file of ['powersync.yaml', 'sync-config.yaml']) {
    fs.copyFileSync(
      path.join(repoRoot, 'docker/powersync', file),
      path.join(runtimeSource, 'docker/powersync', file),
    );
  }
  fs.copyFileSync(
    path.join(repoRoot, 'deployment/staging/docker-compose.staging.yml'),
    path.join(runtimeSource, 'docker-compose.staging.yml'),
  );
  fs.copyFileSync(watcherPath, path.join(runtimeSource, 'staging-deploy-watch.sh'));
  fs.writeFileSync(
    secret,
    'DB_NAME=test\nDB_USER=test\nDB_PASSWORD=test\nREDIS_PASSWORD=test\nPOWERSYNC_PUBLIC_KEY_N=test\nPOWERSYNC_KEY_ID=test\n',
  );
  fs.writeFileSync(
    config,
    [
      'STAGING_REGISTRY=registry.example',
      'STAGING_NAMESPACE=memoflow',
      'STAGING_DISTRIBUTION=china',
      'STAGING_CHANNEL_TAG=staging-latest',
      `STAGING_SECRET_ENV=${secret}`,
      'STAGING_POSTGRES_IMAGE=registry.example/memoflow/memoflow-postgres:test',
      'STAGING_REDIS_IMAGE=registry.example/memoflow/memoflow-redis:test',
      'STAGING_POWERSYNC_IMAGE=registry.example/memoflow/memoflow-powersync:test',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash\nset -euo pipefail\n` +
      `if [[ \"$1\" == pull ]]; then exit 0; fi\n` +
      `if [[ \"$1 $2\" == 'image inspect' ]]; then\n` +
      `  ref=\"$3\"; fmt=\"$5\"\n` +
      `  if [[ \"$fmt\" == *revision* ]]; then\n` +
      `    if [[ \"$ref\" == *memoflow-api* ]]; then printf '%s\\n' '${missingApiRevision ? '' : apiRevision}'; else printf '%s\\n' '${revision}'; fi\n` +
      `  else\n` +
      `    case \"$ref\" in *memoflow-web*) d='${digest('1')}' ;; *memoflow-api*) d='${apiDigest}' ;; *memoflow-migrator*) d='${digest('3')}' ;; *memoflow-staging-runtime*) d='${digest('4')}' ;; *memoflow-postgres*) d='${runtimeMirrorDigest('memoflow-postgres')}' ;; *memoflow-redis*) d='${runtimeMirrorDigest('memoflow-redis')}' ;; *memoflow-powersync*) d='${runtimeMirrorDigest('memoflow-powersync')}' ;; *) d='${digest('9')}' ;; esac\n` +
      `    repo=\"\${ref%:*}\"; printf '%s@%s\\n' \"$repo\" \"$d\"\n` +
      `  fi\n` +
      `  exit 0\nfi\n` +
      `if [[ \"$1\" == create ]]; then echo fake-runtime-container; exit 0; fi\n` +
      `if [[ \"$1\" == cp ]]; then dest=\"$3\"; mkdir -p \"$dest\"; cp -a \"$FAKE_RUNTIME_SOURCE/.\" \"$dest/\"; exit 0; fi\n` +
      `if [[ \"$1\" == rm ]]; then exit 0; fi\n` +
      `echo \"unexpected fake docker args: $*\" >&2; exit 99\n`,
    { mode: 0o755 },
  );
  const result = spawnSync('bash', [watcherPath, '--check-only'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      FAKE_RUNTIME_SOURCE: runtimeSource,
      MEMOFLOW_STAGING_CHANNEL_CONFIG: config,
      MEMOFLOW_STAGING_STATE_DIR: state,
      MEMOFLOW_STAGING_RUNTIME_ROOT: runtimeRoot,
    },
  });
  fs.rmSync(root, { recursive: true, force: true });
  return result;
}

test('staging watcher check-only accepts one candidate-bound coherent channel', () => {
  const result = runWatcher();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`STAGING_CANDIDATE=COHERENT revision=${revision}`));
});

test('staging watcher refuses to treat split revisions as deployable', () => {
  const result = runWatcher({ apiRevision: 'e'.repeat(40) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /staging channel not coherent yet/u);
  assert.doesNotMatch(result.stdout, /STAGING_CANDIDATE=COHERENT/u);
});

test('staging watcher fails closed when revision identity is missing', () => {
  const result = runWatcher({ missingApiRevision: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /api staging image has no org\.opencontainers\.image\.revision/u);
});

test('staging watcher fails closed when mutable channel digest does not match candidate manifest', () => {
  const result = runWatcher({ apiDigest: digest('8') });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /api staging digest mismatch/u);
});

test('staging watcher selects the configured candidate distribution instead of hard-coding China', () => {
  const watcher = fs.readFileSync(watcherPath, 'utf8');
  const installer = fs.readFileSync(
    path.join(repoRoot, 'deployment/staging/install-staging-deploy-watch.sh'),
    'utf8',
  );
  assert.match(watcher, /DISTRIBUTION=\$\{STAGING_DISTRIBUTION:-global\}/u);
  assert.match(watcher, /distributions\.\$DISTRIBUTION\.repository/u);
  assert.match(watcher, /repository mismatch/u);
  assert.match(installer, /distribution=\$\{STAGING_DISTRIBUTION:-global\}/u);
  assert.match(installer, /registry=\$\{STAGING_REGISTRY:-ghcr\.io\}/u);
  assert.match(installer, /tr '\[:upper:\]' '\[:lower:\]'/u);
  assert.match(installer, /awk '!\/\^STAGING_\(POSTGRES\|REDIS\|POWERSYNC\)_IMAGE=\/'/u);
  assert.doesNotMatch(installer, /^STAGING_(?:POSTGRES|REDIS|POWERSYNC)_IMAGE=/mu);
});

test('staging installer removes stale host runtime pins while preserving host-owned settings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-staging-install-'));
  const configDir = path.join(root, 'config');
  const config = path.join(configDir, 'staging-channel.env');
  const secret = path.join(configDir, 'staging.env');
  const bin = path.join(root, 'fake-bin');
  const installedBin = path.join(root, 'installed-bin');
  const systemd = path.join(root, 'systemd');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(secret, 'DB_PASSWORD=test\n');
  fs.writeFileSync(
    config,
    [
      'STAGING_REGISTRY=ghcr.io',
      'STAGING_NAMESPACE=example',
      'STAGING_DISTRIBUTION=global',
      'STAGING_CHANNEL_TAG=staging-latest',
      `STAGING_SECRET_ENV=${secret}`,
      'STAGING_COMPOSE_PROJECT=memoflow-staging',
      'STAGING_POSTGRES_IMAGE=ghcr.io/example/memoflow-postgres:old',
      'STAGING_REDIS_IMAGE=ghcr.io/example/memoflow-redis:old',
      'STAGING_POWERSYNC_IMAGE=ghcr.io/example/memoflow-powersync:1.20.4-old',
      'STAGING_EXTERNAL_WEB_URL=https://staging.example.test/',
      'CUSTOM_HOST_SETTING=preserve-me',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  fs.writeFileSync(path.join(bin, 'systemctl'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });

  const installer = path.join(repoRoot, 'deployment/staging/install-staging-deploy-watch.sh');
  const result = spawnSync('bash', [installer], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HOME: root,
      MEMOFLOW_STAGING_CONFIG_DIR: configDir,
      MEMOFLOW_STAGING_CHANNEL_CONFIG: config,
      MEMOFLOW_STAGING_SECRET_ENV: secret,
      MEMOFLOW_STAGING_BIN_DIR: installedBin,
      MEMOFLOW_STAGING_SYSTEMD_DIR: systemd,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const upgraded = fs.readFileSync(config, 'utf8');
  assert.doesNotMatch(upgraded, /^STAGING_(?:POSTGRES|REDIS|POWERSYNC)_IMAGE=/mu);
  assert.match(
    upgraded,
    new RegExp(`^STAGING_SECRET_ENV=${secret.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'mu'),
  );
  assert.match(upgraded, /^STAGING_EXTERNAL_WEB_URL=https:\/\/staging\.example\.test\/$/mu);
  assert.match(upgraded, /^CUSTOM_HOST_SETTING=preserve-me$/mu);
  assert.equal(fs.statSync(config).mode & 0o777, 0o600);
  assert.ok(fs.existsSync(path.join(installedBin, 'memoflow-staging-deploy-watch')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('staging runtime locks exact digest deployment and migration failure boundaries', () => {
  const watcher = fs.readFileSync(watcherPath, 'utf8');
  const compose = fs.readFileSync(
    path.join(repoRoot, 'deployment/staging/docker-compose.staging.yml'),
    'utf8',
  );
  const installer = fs.readFileSync(
    path.join(repoRoot, 'deployment/staging/install-staging-deploy-watch.sh'),
    'utf8',
  );
  assert.match(watcher, /STAGING_API_IMAGE=\$\(repo_for api\)@\$\(expected_digest_for api\)/u);
  assert.match(watcher, /STAGING_WEB_IMAGE=\$\(repo_for web\)@\$\(expected_digest_for web\)/u);
  assert.match(watcher, /runtime-image-mirrors\.json/u);
  assert.match(watcher, /STAGING_POWERSYNC_IMAGE=\$powersync_runtime_image/u);
  assert.match(watcher, /runtime mirror tag does not bind digest prefix/u);
  assert.doesNotMatch(installer, /STAGING_POWERSYNC_IMAGE=/u);
  assert.match(watcher, /compose run --rm --no-deps migrator/u);
  assert.ok(
    watcher.indexOf('compose run --rm --no-deps migrator') <
      watcher.indexOf('compose up -d --no-build --no-deps api'),
  );
  assert.match(
    watcher,
    /deployment crossed migration boundary; recorded BLOCKED instead of blind rollback/u,
  );
  assert.match(watcher, /trap 'on_signal TERM 143' TERM/u);
  assert.match(watcher, /restoring previous staging runtime before migration boundary/u);
  assert.match(compose, /image: \$\{STAGING_MIGRATOR_IMAGE:\?set STAGING_MIGRATOR_IMAGE\}/u);
  assert.match(compose, /image: \$\{STAGING_API_IMAGE:\?set STAGING_API_IMAGE\}/u);
  assert.match(compose, /image: \$\{STAGING_WEB_IMAGE:\?set STAGING_WEB_IMAGE\}/u);
  assert.doesNotMatch(compose, /build:/u);
});

function runDeploymentTransaction({
  failPhase = '',
  rerun = false,
  retryAfterFailure = false,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-staging-deploy-'));
  const bin = path.join(root, 'bin');
  const state = path.join(root, 'state');
  const runtimeRoot = path.join(root, 'runtime');
  const runtimeSource = path.join(root, 'runtime-source');
  const config = path.join(root, 'staging-channel.env');
  const secret = path.join(root, 'staging.env');
  const log = path.join(root, 'docker.log');
  const failMarker = path.join(root, 'failed-once');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  fs.mkdirSync(path.join(runtimeRoot, 'docker/powersync'), { recursive: true });
  fs.mkdirSync(path.join(runtimeSource, 'docker/powersync'), { recursive: true });
  fs.mkdirSync(path.join(runtimeSource, 'tools/ci-cd-platform/lib'), { recursive: true });
  fs.mkdirSync(path.join(runtimeSource, 'systemd'), { recursive: true });

  const next = candidate();
  fs.writeFileSync(
    path.join(runtimeSource, 'candidate-set-v1.json'),
    `${JSON.stringify(next, null, 2)}\n`,
  );
  fs.copyFileSync(
    path.join(repoRoot, 'tools/ci-cd-platform/candidate-manifest.mjs'),
    path.join(runtimeSource, 'tools/ci-cd-platform/candidate-manifest.mjs'),
  );
  fs.copyFileSync(
    path.join(repoRoot, 'tools/ci-cd-platform/runtime-image-mirrors.json'),
    path.join(runtimeSource, 'tools/ci-cd-platform/runtime-image-mirrors.json'),
  );
  fs.copyFileSync(
    path.join(repoRoot, 'tools/ci-cd-platform/lib/contracts.mjs'),
    path.join(runtimeSource, 'tools/ci-cd-platform/lib/contracts.mjs'),
  );
  fs.copyFileSync(
    path.join(repoRoot, 'deployment/staging/docker-compose.staging.yml'),
    path.join(runtimeSource, 'docker-compose.staging.yml'),
  );
  fs.copyFileSync(watcherPath, path.join(runtimeSource, 'staging-deploy-watch.sh'));
  for (const file of ['powersync.yaml', 'sync-config.yaml']) {
    fs.copyFileSync(
      path.join(repoRoot, 'docker/powersync', file),
      path.join(runtimeSource, 'docker/powersync', file),
    );
  }
  for (const file of [
    'memoflow-staging-deploy-watch.service',
    'memoflow-staging-deploy-watch.timer',
  ]) {
    fs.copyFileSync(
      path.join(repoRoot, 'deployment/staging/systemd', file),
      path.join(runtimeSource, 'systemd', file),
    );
  }

  // Previous runtime is deliberately distinct so a pre-migration rollback is observable.
  fs.copyFileSync(
    path.join(repoRoot, 'deployment/staging/docker-compose.staging.yml'),
    path.join(runtimeRoot, 'docker-compose.staging.yml'),
  );
  fs.writeFileSync(
    path.join(runtimeRoot, 'runtime-images.env'),
    [
      'STAGING_WEB_IMAGE=registry.example/memoflow/memoflow-web@sha256:' + 'a'.repeat(64),
      'STAGING_API_IMAGE=registry.example/memoflow/memoflow-api@sha256:' + 'b'.repeat(64),
      'STAGING_MIGRATOR_IMAGE=registry.example/memoflow/memoflow-migrator@sha256:' + 'c'.repeat(64),
      'STAGING_POSTGRES_IMAGE=registry.example/memoflow/memoflow-postgres:test',
      'STAGING_REDIS_IMAGE=registry.example/memoflow/memoflow-redis:test',
      'STAGING_POWERSYNC_IMAGE=registry.example/memoflow/memoflow-powersync:test',
      `STAGING_SECRET_ENV=${secret}`,
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(state, 'staging-deploy-state'),
    `status=DEPLOYED\nrevision=${'e'.repeat(40)}\n`,
  );
  fs.writeFileSync(
    secret,
    [
      'DB_NAME=test',
      'DB_USER=test',
      'DB_PASSWORD=test',
      'REDIS_PASSWORD=test',
      'POWERSYNC_PUBLIC_KEY_N=test',
      'POWERSYNC_KEY_ID=test',
      'JWT_SECRET=test',
      'AI_PROVIDER_ENCRYPTION_KEY=01234567890123456789012345678901',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    config,
    [
      'STAGING_REGISTRY=registry.example',
      'STAGING_NAMESPACE=memoflow',
      'STAGING_DISTRIBUTION=china',
      'STAGING_CHANNEL_TAG=staging-latest',
      `STAGING_SECRET_ENV=${secret}`,
      'STAGING_COMPOSE_PROJECT=memoflow-staging-test',
      'STAGING_POSTGRES_IMAGE=registry.example/memoflow/memoflow-postgres:test',
      'STAGING_REDIS_IMAGE=registry.example/memoflow/memoflow-redis:test',
      'STAGING_POWERSYNC_IMAGE=registry.example/memoflow/memoflow-powersync:test',
      '',
    ].join('\n'),
  );

  fs.writeFileSync(path.join(bin, 'curl'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'systemctl'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash\nset -euo pipefail\necho \"$*\" >> \"$FAKE_DOCKER_LOG\"\n` +
      `if [[ \"$1\" == pull ]]; then exit 0; fi\n` +
      `if [[ \"$1 $2\" == 'image inspect' ]]; then\n` +
      `  ref=\"$3\"; fmt=\"$5\"\n` +
      `  if [[ \"$fmt\" == *revision* ]]; then printf '%s\\n' '${revision}'; exit 0; fi\n` +
      `  repo=\"\${ref%:*}\"\n` +
      `  case \"$ref\" in *memoflow-web*) d='${digest('1')}' ;; *memoflow-api*) d='${digest('2')}' ;; *memoflow-migrator*) d='${digest('3')}' ;; *memoflow-staging-runtime*) d='${digest('4')}' ;; *memoflow-postgres*) d='${runtimeMirrorDigest('memoflow-postgres')}' ;; *memoflow-redis*) d='${runtimeMirrorDigest('memoflow-redis')}' ;; *memoflow-powersync*) d='${runtimeMirrorDigest('memoflow-powersync')}' ;; *) d='${digest('9')}' ;; esac\n` +
      `  printf '%s@%s\\n' \"$repo\" \"$d\"; exit 0\nfi\n` +
      `if [[ \"$1\" == create ]]; then echo fake-runtime-container; exit 0; fi\n` +
      `if [[ \"$1\" == cp ]]; then dest=\"$3\"; mkdir -p \"$dest\"; cp -a \"$FAKE_RUNTIME_SOURCE/.\" \"$dest/\"; exit 0; fi\n` +
      `if [[ \"$1\" == rm ]]; then exit 0; fi\n` +
      `if [[ \"$1\" == inspect ]]; then\n` +
      `  id=\"$2\"; fmt=\"$4\"; if [[ \"$fmt\" == *'.Image'* ]]; then echo \"imageid-\${id#container-}\"; else echo healthy; fi; exit 0\nfi\n` +
      `if [[ \"$1\" == compose ]]; then\n` +
      `  args=\" $* \"\n` +
      `  if [[ \"$args\" == *' ps -q '* ]]; then service=\"\${!#}\"; echo \"container-$service\"; exit 0; fi\n` +
      `  if [[ \"$args\" == *' run --rm --no-deps migrator '* ]]; then exit 0; fi\n` +
      `  if [[ \"$FAKE_FAIL_PHASE\" == pre && \"$args\" == *' up -d --no-build postgres redis '* && ! -e \"$FAKE_FAIL_MARKER\" ]]; then touch \"$FAKE_FAIL_MARKER\"; exit 42; fi\n` +
      `  if [[ \"$FAKE_FAIL_PHASE\" == post && \"$args\" == *' up -d --no-build --no-deps api '* && ! -e \"$FAKE_FAIL_MARKER\" ]]; then touch \"$FAKE_FAIL_MARKER\"; exit 43; fi\n` +
      `  exit 0\nfi\n` +
      `echo \"unexpected fake docker args: $*\" >&2; exit 99\n`,
    { mode: 0o755 },
  );

  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    FAKE_RUNTIME_SOURCE: runtimeSource,
    FAKE_DOCKER_LOG: log,
    FAKE_FAIL_PHASE: failPhase,
    FAKE_FAIL_MARKER: failMarker,
    MEMOFLOW_STAGING_CHANNEL_CONFIG: config,
    MEMOFLOW_STAGING_STATE_DIR: state,
    MEMOFLOW_STAGING_RUNTIME_ROOT: runtimeRoot,
    MEMOFLOW_STAGING_BIN_DIR: path.join(root, 'installed-bin'),
    MEMOFLOW_STAGING_SYSTEMD_DIR: path.join(root, 'systemd'),
  };
  const first = spawnSync('bash', [watcherPath], { cwd: repoRoot, encoding: 'utf8', env });
  let second = null;
  if ((rerun && first.status === 0) || (retryAfterFailure && first.status !== 0)) {
    second = spawnSync('bash', [watcherPath], { cwd: repoRoot, encoding: 'utf8', env });
  }
  const stateText = fs.readFileSync(path.join(state, 'staging-deploy-state'), 'utf8');
  const runtimeEnv = fs.existsSync(path.join(runtimeRoot, 'runtime-images.env'))
    ? fs.readFileSync(path.join(runtimeRoot, 'runtime-images.env'), 'utf8')
    : '';
  const dockerLog = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  fs.rmSync(root, { recursive: true, force: true });
  return { first, second, stateText, runtimeEnv, dockerLog };
}

test('staging watcher commits exact digest state and replays idempotently', () => {
  const result = runDeploymentTransaction({ rerun: true });
  assert.equal(result.first.status, 0, result.first.stderr);
  assert.match(result.first.stdout, /STAGING_DEPLOY=PASS/u);
  assert.equal(result.second?.status, 0, result.second?.stderr);
  assert.match(result.second?.stdout ?? '', /already deployed staging revision/u);
  assert.match(result.stateText, /^status=DEPLOYED$/mu);
  assert.match(result.stateText, new RegExp(`^revision=${revision}$`, 'mu'));
  assert.match(result.stateText, /^candidate_digest=sha256:[0-9a-f]{64}$/mu);
  assert.match(result.stateText, /^web_digest=sha256:1{64}$/mu);
  assert.match(
    result.stateText,
    new RegExp(`^powersync_digest=${runtimeMirrorDigest('memoflow-powersync')}$`, 'mu'),
  );
  assert.match(
    result.runtimeEnv,
    new RegExp(
      `STAGING_POWERSYNC_IMAGE=registry\\.example/memoflow/memoflow-powersync@${runtimeMirrorDigest('memoflow-powersync')}`,
    ),
  );
  assert.equal((result.dockerLog.match(/ run --rm --no-deps migrator/gmu) ?? []).length, 1);
});

test('staging watcher restores the previous runtime on a pre-migration failure', () => {
  const result = runDeploymentTransaction({ failPhase: 'pre' });
  assert.notEqual(result.first.status, 0);
  assert.match(
    result.first.stdout,
    /restoring previous staging runtime before migration boundary/u,
  );
  assert.match(result.stateText, new RegExp(`^revision=${'e'.repeat(40)}$`, 'mu'));
  assert.match(result.runtimeEnv, /memoflow-web@sha256:a{64}/u);
});

test('staging watcher records BLOCKED instead of blind rollback after migrator succeeds', () => {
  const result = runDeploymentTransaction({ failPhase: 'post', retryAfterFailure: true });
  assert.notEqual(result.first.status, 0);
  assert.match(result.first.stdout, /recorded BLOCKED instead of blind rollback/u);
  assert.match(result.stateText, /^status=BLOCKED$/mu);
  assert.match(result.stateText, /^blocked_reason=error$/mu);
  assert.match(result.stateText, new RegExp(`^revision=${revision}$`, 'mu'));
  assert.match(result.runtimeEnv, /memoflow-web@sha256:1{64}/u);
  assert.notEqual(result.second?.status, 0);
  assert.match(result.second?.stderr ?? '', /staging deployment is BLOCKED/u);
  assert.equal((result.dockerLog.match(/ run --rm --no-deps migrator/gmu) ?? []).length, 1);
});
