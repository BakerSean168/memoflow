import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createCandidateSet } from '../candidate-manifest.mjs';
import { createProductionSet } from '../production-manifest.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const watcherPath = path.join(repoRoot, 'deployment/production/production-deploy-watch.sh');
const registry = 'registry.example';
const namespace = 'memoflow';
const releaseSha = 'a'.repeat(40);
const controlPlaneSha = 'f'.repeat(40);
const releaseTag = 'v0.13.0';
const digest = (char) => `sha256:${char.repeat(64)}`;
const runtimeControlDigest = digest('9');
const candidateTag = `sha-${releaseSha}`;

function candidateImage(name, char) {
  return {
    tag: candidateTag,
    digest: digest(char),
    revision: releaseSha,
    distributions: {
      china: {
        repository: `${registry}/${namespace}/memoflow-${name}`,
        tag: candidateTag,
        digest: digest(char),
      },
      global: {
        repository: `ghcr.io/example/memoflow-${name}`,
        tag: candidateTag,
        digest: digest(char),
      },
    },
  };
}

function fixtureProductionSet() {
  const candidate = createCandidateSet({
    gitSha: releaseSha,
    ciRunId: '42',
    deliveryManifestDigest: digest('d'),
    images: {
      web: candidateImage('web', '1'),
      api: candidateImage('api', '2'),
      migrator: candidateImage('migrator', '3'),
    },
    generatedAt: '2026-09-05T00:00:00.000Z',
  });
  const releaseImage = (component) => {
    const source = candidate.images[component];
    return {
      repository: source.distributions.china.repository,
      tags: [releaseTag],
      digest: source.digest,
      distributions: {
        china: { ...source.distributions.china, tags: [releaseTag] },
        global: { ...source.distributions.global, tags: [releaseTag] },
      },
    };
  };
  const release = {
    schemaVersion: 2,
    kind: 'memoflow-release',
    version: '0.13.0',
    tag: releaseTag,
    gitSha: releaseSha,
    ciRunId: 42,
    deliveryManifestDigest: candidate.deliveryManifestDigest,
    candidateSet: { digest: candidate.digest, candidateTag },
    docker: {
      images: {
        web: releaseImage('web'),
        api: releaseImage('api'),
        migrator: releaseImage('migrator'),
      },
    },
  };
  const mirrorConfig = {
    images: [
      ['postgres', '4'],
      ['redis', '5'],
      ['caddy', '6'],
      ['powersync', '7'],
      ['watchtower', '8'],
    ].map(([name, char]) => ({
      name: `memoflow-${name}`,
      source: `docker.io/example/${name}@${digest(char)}`,
      tag: `fixture-${char.repeat(12)}`,
      platform: 'linux/amd64',
    })),
  };
  return createProductionSet({
    release,
    candidate,
    mirrorConfig,
    registry,
    namespace,
    controlPlaneSha,
  });
}

function writeRuntimeSource(root, productionSet) {
  const runtimeSource = path.join(root, 'runtime-source');
  fs.mkdirSync(path.join(runtimeSource, 'docker/powersync'), { recursive: true });
  fs.mkdirSync(path.join(runtimeSource, 'systemd'), { recursive: true });
  const json = `${JSON.stringify(productionSet, null, 2)}\n`;
  fs.writeFileSync(path.join(runtimeSource, 'production-set-v1.json'), json);
  const raw = createHash('sha256').update(json).digest('hex');
  fs.writeFileSync(
    path.join(runtimeSource, 'production-set-v1.sha256'),
    `${raw}  production-set-v1.json\n`,
  );
  for (const [source, target] of [
    ['deployment/production/docker-compose.production.yml', 'docker-compose.production.yml'],
    ['deployment/production/production-deploy-watch.sh', 'production-deploy-watch.sh'],
    [
      'deployment/production/install-production-deploy-watch.sh',
      'install-production-deploy-watch.sh',
    ],
    ['Caddyfile', 'Caddyfile'],
    ['docker/powersync/powersync.yaml', 'docker/powersync/powersync.yaml'],
    ['docker/powersync/sync-config.yaml', 'docker/powersync/sync-config.yaml'],
    [
      'deployment/production/systemd/memoflow-production-deploy-watch.service',
      'systemd/memoflow-production-deploy-watch.service',
    ],
    [
      'deployment/production/systemd/memoflow-production-deploy-watch.timer',
      'systemd/memoflow-production-deploy-watch.timer',
    ],
  ]) {
    fs.copyFileSync(path.join(repoRoot, source), path.join(runtimeSource, target));
  }
  return { runtimeSource, rawSha: `sha256:${raw}` };
}

function expectedRef(productionSet, service) {
  const image = ['api', 'web', 'migrator'].includes(service)
    ? productionSet.images[service]
    : productionSet.runtime[service];
  return `${image.repository}@${image.digest}`;
}

function writeFakeDocker({
  root,
  productionSet,
  runtimeSource,
  rawSha,
  failPhase = '',
  apiDigestOverride = '',
  powersyncDowngrade = false,
}) {
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'docker.log');
  const curlLog = path.join(root, 'curl.log');
  const failMarker = path.join(root, 'failed-once');
  const currentPowersyncRef = powersyncDowngrade
    ? `${registry}/${namespace}/memoflow-powersync@${digest('a')}`
    : expectedRef(productionSet, 'powersync');
  fs.mkdirSync(bin, { recursive: true });
  const refs = Object.fromEntries(
    ['api', 'web', 'migrator', 'postgres', 'redis', 'powersync', 'caddy'].map((service) => [
      service,
      expectedRef(productionSet, service),
    ]),
  );
  const script = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
if [[ "$1" == pull ]]; then exit 0; fi
if [[ "$1 $2" == 'image inspect' ]]; then
  ref="$3"; fmt="$5"
  if [[ "$fmt" == *'org.opencontainers.image.revision'* ]]; then printf '%s\\n' "$CONTROL_PLANE_SHA"; exit 0; fi
  if [[ "$fmt" == *'io.memoflow.release.revision'* ]]; then printf '%s\\n' "$RELEASE_SHA"; exit 0; fi
  if [[ "$fmt" == *'io.memoflow.production-set.digest'* ]]; then printf '%s\\n' "$PRODUCTION_SET_DIGEST"; exit 0; fi
  if [[ "$fmt" == *'io.memoflow.production-set.sha256'* ]]; then printf '%s\\n' "$PRODUCTION_SET_SHA256"; exit 0; fi
  if [[ "$fmt" == *'org.opencontainers.image.version'* ]]; then
    if [[ "$ref" == "$CURRENT_POWERSYNC_REF" ]]; then printf '%s\\n' "$CURRENT_POWERSYNC_VERSION"; else printf '%s\\n' "$DESIRED_POWERSYNC_VERSION"; fi
    exit 0
  fi
  if [[ "$ref" == *memoflow-production-runtime* ]]; then repo="\${ref%:*}"; printf '%s@%s\\n' "$repo" "$RUNTIME_CONTROL_DIGEST"; exit 0; fi
  if [[ "$ref" == *@sha256:* ]]; then
    repo="\${ref%@*}"; d="\${ref##*@}"
    if [[ "$ref" == *memoflow-api* && -n "$API_DIGEST_OVERRIDE" ]]; then d="$API_DIGEST_OVERRIDE"; fi
    printf '%s@%s\\n' "$repo" "$d"; exit 0
  fi
  exit 2
fi
if [[ "$1" == create ]]; then echo fake-runtime-container; exit 0; fi
if [[ "$1" == cp ]]; then dest="$3"; mkdir -p "$dest"; cp -a "$FAKE_RUNTIME_SOURCE/." "$dest/"; exit 0; fi
if [[ "$1" == rm ]]; then exit 0; fi
if [[ "$1" == ps ]]; then
  joined="$*"
  if [[ "$joined" == *'label=com.docker.compose.service=postgres'* ]]; then echo current-postgres; exit 0; fi
  if [[ "$joined" == *'label=com.docker.compose.service=powersync'* ]]; then echo current-powersync; exit 0; fi
  if [[ "$joined" == *'label=com.docker.compose.service=api'* ]]; then echo current-api; exit 0; fi
  if [[ "$joined" == *'label=com.docker.compose.service=web'* ]]; then echo current-web; exit 0; fi
  if [[ "$joined" == *'label=com.docker.compose.service=redis'* ]]; then echo current-redis; exit 0; fi
  if [[ "$joined" == *'label=com.docker.compose.service=caddy'* ]]; then echo current-caddy; exit 0; fi
  if [[ "$joined" == *' -q '* || "$joined" == 'ps -q'* ]]; then
    printf '%s\\n' current-postgres current-api current-web current-powersync current-redis current-caddy
  else
    printf '%s\\n' 'memoflow-api-1 fake healthy' 'memoflow-web-1 fake healthy'
  fi
  exit 0
fi
if [[ "$1" == inspect ]]; then
  shift
  if [[ "$*" != *'--format'* ]]; then echo '[]'; exit 0; fi
  id="$1"; fmt="$3"
  if [[ "$fmt" == *'.Config.Image'* || "$fmt" == *'{{.Image}}'* ]]; then
    case "$id" in
      current-postgres|cid-postgres) printf '%s\\n' '${refs.postgres}' ;;
      current-api|cid-api) [[ '${failPhase}' == api-ref ]] && printf '%s\\n' 'registry.example/memoflow/memoflow-api@${digest('e')}' || printf '%s\\n' '${refs.api}' ;;
      current-web|cid-web) printf '%s\\n' '${refs.web}' ;;
      current-powersync) printf '%s\\n' "$CURRENT_POWERSYNC_REF" ;;
      cid-powersync) printf '%s\\n' '${refs.powersync}' ;;
      current-redis|cid-redis) printf '%s\\n' '${refs.redis}' ;;
      current-caddy|cid-caddy) printf '%s\\n' '${refs.caddy}' ;;
      *) printf '%s\\n' unknown ;;
    esac
  else
    printf '%s\\n' healthy
  fi
  exit 0
fi
if [[ "$1" == exec ]]; then printf '%s\\n' '-- fixture pg dump'; exit 0; fi
if [[ "$1" == compose ]]; then
  joined="$*"
  if [[ "$joined" == *' config -q'* ]]; then exit 0; fi
  if [[ "$joined" == *' ps -q '* ]]; then service="\${joined##* ps -q }"; printf 'cid-%s\\n' "$service"; exit 0; fi
  if [[ "$joined" == *' up -d --no-build postgres redis'* && '${failPhase}' == pre-migration && ! -e '${failMarker}' ]]; then touch '${failMarker}'; exit 41; fi
  if [[ "$joined" == *' run --rm --no-deps migrator'* && '${failPhase}' == migrator ]]; then exit 42; fi
  exit 0
fi
echo "unexpected fake docker args: $*" >&2
exit 99
`;
  fs.writeFileSync(path.join(bin, 'docker'), script, { mode: 0o755 });
  fs.writeFileSync(
    path.join(bin, 'curl'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_CURL_LOG"
exit 0
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(bin, 'systemctl'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
  return { bin, log, curlLog };
}

function setupFixture({
  failPhase = '',
  apiDigestOverride = '',
  rawShaOverride = '',
  powersyncDowngrade = false,
  blockedRecovery = false,
  baselineApiOverride = '',
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoflow-production-watch-'));
  const state = path.join(root, 'state');
  const runtimeRoot = path.join(root, 'runtime');
  const systemdDir = path.join(root, 'systemd');
  const binPath = path.join(root, 'installed', 'memoflow-production-deploy-watch');
  const config = path.join(root, 'production-channel.env');
  const secret = path.join(root, 'production.env');
  const productionSet = fixtureProductionSet();
  const { runtimeSource, rawSha } = writeRuntimeSource(root, productionSet);
  fs.mkdirSync(state, { recursive: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.mkdirSync(systemdDir, { recursive: true });
  fs.mkdirSync(path.dirname(binPath), { recursive: true });
  fs.writeFileSync(
    path.join(runtimeRoot, 'docker-compose.production.yml'),
    fs.readFileSync(path.join(repoRoot, 'deployment/production/docker-compose.production.yml')),
  );
  fs.writeFileSync(path.join(runtimeRoot, 'runtime-images.env'), 'API_IMAGE=previous\n');
  fs.writeFileSync(path.join(runtimeRoot, 'previous-marker'), 'previous\n');
  fs.writeFileSync(
    path.join(state, 'production-deploy-state'),
    blockedRecovery
      ? `status=BLOCKED\nproduction_set_digest=${digest('0')}\nblocked_reason=fixture\n`
      : `status=DEPLOYED\nproduction_set_digest=${digest('0')}\n`,
  );
  if (blockedRecovery) {
    const previousRoot = `${runtimeRoot}.prev`;
    fs.mkdirSync(previousRoot, { recursive: true });
    fs.copyFileSync(
      path.join(repoRoot, 'deployment/production/docker-compose.production.yml'),
      path.join(previousRoot, 'docker-compose.production.yml'),
    );
    const imageLines = ['api', 'web', 'migrator', 'postgres', 'redis', 'powersync', 'caddy'].map(
      (service) => {
        const key = `${service.toUpperCase()}_IMAGE`;
        const value =
          service === 'api' && baselineApiOverride
            ? `${registry}/${namespace}/memoflow-api@${baselineApiOverride}`
            : expectedRef(productionSet, service);
        return `${key}=${value}`;
      },
    );
    fs.writeFileSync(path.join(previousRoot, 'runtime-images.env'), `${imageLines.join('\n')}\n`);
    fs.writeFileSync(path.join(previousRoot, 'live-baseline-marker'), 'live\n');
    fs.rmSync(path.join(runtimeRoot, 'previous-marker'), { force: true });
    fs.writeFileSync(path.join(runtimeRoot, 'failed-control-root-marker'), 'failed\n');
  }
  fs.writeFileSync(
    secret,
    'DB_NAME=test\nDB_USER=test\nDB_PASSWORD=test\nREDIS_PASSWORD=test\nPOWERSYNC_PUBLIC_KEY_N=test\nPOWERSYNC_KEY_ID=test\n',
    { mode: 0o600 },
  );
  fs.writeFileSync(
    config,
    [
      `PRODUCTION_REGISTRY=${registry}`,
      `PRODUCTION_NAMESPACE=${namespace}`,
      'PRODUCTION_CHANNEL_TAG=production-selected',
      `PRODUCTION_SECRET_ENV=${secret}`,
      'PRODUCTION_COMPOSE_PROJECT=memoflow',
      'PRODUCTION_EXTERNAL_API_URL=https://api.example.test/healthz',
      'PRODUCTION_EXTERNAL_WEB_URL=https://web.example.test/',
      'PRODUCTION_EXTERNAL_POWERSYNC_URL=https://sync.example.test/probes/liveness',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  const { bin, log, curlLog } = writeFakeDocker({
    root,
    productionSet,
    runtimeSource,
    rawSha,
    failPhase,
    apiDigestOverride,
    powersyncDowngrade,
  });
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    FAKE_DOCKER_LOG: log,
    FAKE_CURL_LOG: curlLog,
    FAKE_RUNTIME_SOURCE: runtimeSource,
    CONTROL_PLANE_SHA: controlPlaneSha,
    RELEASE_SHA: releaseSha,
    PRODUCTION_SET_DIGEST: productionSet.digest,
    PRODUCTION_SET_SHA256: rawShaOverride || rawSha,
    RUNTIME_CONTROL_DIGEST: runtimeControlDigest,
    API_DIGEST_OVERRIDE: apiDigestOverride,
    CURRENT_POWERSYNC_REF: powersyncDowngrade
      ? `${registry}/${namespace}/memoflow-powersync@${digest('a')}`
      : expectedRef(productionSet, 'powersync'),
    CURRENT_POWERSYNC_VERSION: powersyncDowngrade ? '1.25.0' : '1.25.0',
    DESIRED_POWERSYNC_VERSION: powersyncDowngrade ? '1.20.4' : '1.25.0',
    MEMOFLOW_PRODUCTION_CHANNEL_CONFIG: config,
    MEMOFLOW_PRODUCTION_STATE_DIR: state,
    MEMOFLOW_PRODUCTION_RUNTIME_ROOT: runtimeRoot,
    MEMOFLOW_PRODUCTION_LEGACY_ROOT: path.join(root, 'legacy-unused'),
    MEMOFLOW_PRODUCTION_BIN_PATH: binPath,
    MEMOFLOW_PRODUCTION_SYSTEMD_DIR: systemdDir,
  };
  return { root, state, runtimeRoot, productionSet, env, log, curlLog };
}

function run(fixture, args = []) {
  return spawnSync('bash', [watcherPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: fixture.env,
  });
}

test('production watcher check-only accepts one coherent exact-digest production selection', () => {
  const fixture = setupFixture();
  try {
    const result = run(fixture, ['--check-only']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`PRODUCTION_SELECTION=COHERENT release=${releaseTag}`));
    assert.match(result.stdout, new RegExp(`set=${fixture.productionSet.digest}`));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('production watcher fails closed when an exact application digest drifts', () => {
  const fixture = setupFixture({ apiDigestOverride: digest('e') });
  try {
    const result = run(fixture, ['--check-only']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /image digest mismatch.*memoflow-api/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('production watcher restores the previous runtime on a pre-migration failure', () => {
  const fixture = setupFixture({ failPhase: 'pre-migration' });
  try {
    const result = run(fixture);
    assert.notEqual(
      result.status,
      0,
      `${result.stdout}\n${result.stderr}\n${fs.readFileSync(fixture.log, 'utf8')}`,
    );
    assert.match(
      result.stdout + result.stderr,
      /restoring previous production runtime before migration boundary/u,
    );
    assert.equal(fs.existsSync(path.join(fixture.runtimeRoot, 'previous-marker')), true);
    const state = fs.readFileSync(path.join(fixture.state, 'production-deploy-state'), 'utf8');
    assert.doesNotMatch(state, /^status=BLOCKED$/mu);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('forced BLOCKED recovery restores the preserved live baseline on a pre-migration failure', () => {
  const fixture = setupFixture({ failPhase: 'pre-migration', blockedRecovery: true });
  try {
    const result = run(fixture, ['--force']);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout + result.stderr,
      /forced BLOCKED recovery verified the preserved live rollback baseline/u,
    );
    assert.match(
      result.stdout + result.stderr,
      /restoring previous production runtime before migration boundary/u,
    );
    assert.equal(fs.existsSync(path.join(fixture.runtimeRoot, 'live-baseline-marker')), true);
    assert.equal(
      fs.existsSync(path.join(fixture.runtimeRoot, 'failed-control-root-marker')),
      false,
    );
    const state = fs.readFileSync(path.join(fixture.state, 'production-deploy-state'), 'utf8');
    assert.match(state, /^status=BLOCKED$/mu);
    const log = fs.readFileSync(fixture.log, 'utf8');
    assert.doesNotMatch(log, /run --rm --no-deps migrator/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('forced BLOCKED recovery rejects a preserved baseline that differs from live production', () => {
  const fixture = setupFixture({ blockedRecovery: true, baselineApiOverride: digest('e') });
  try {
    const result = run(fixture, ['--force']);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /forced BLOCKED recovery baseline does not match the current live production runtime/u,
    );
    const state = fs.readFileSync(path.join(fixture.state, 'production-deploy-state'), 'utf8');
    assert.match(state, /^status=BLOCKED$/mu);
    const log = fs.readFileSync(fixture.log, 'utf8');
    assert.doesNotMatch(log, /run --rm --no-deps migrator/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('production watcher records BLOCKED when an application identity fails after migrator starts', () => {
  const fixture = setupFixture({ failPhase: 'api-ref' });
  try {
    const result = run(fixture);
    assert.notEqual(result.status, 0);
    const state = fs.readFileSync(path.join(fixture.state, 'production-deploy-state'), 'utf8');
    assert.match(state, /^status=BLOCKED$/mu);
    assert.match(
      state,
      new RegExp(
        `^production_set_digest=${fixture.productionSet.digest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        'mu',
      ),
    );
    assert.match(state, /^backup_dir=.+$/mu);
    assert.match(result.stdout + result.stderr, /recorded BLOCKED instead of blind rollback/u);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('production watcher commits atomic state and a replay does not rerun migrator', () => {
  const fixture = setupFixture();
  try {
    const first = run(fixture);
    assert.equal(first.status, 0, first.stderr);
    const statePath = path.join(fixture.state, 'production-deploy-state');
    const stateBefore = fs.readFileSync(statePath, 'utf8');
    assert.match(stateBefore, /^status=DEPLOYED$/mu);
    assert.match(stateBefore, new RegExp(`^release_tag=${releaseTag}$`, 'mu'));
    const logBefore = fs.readFileSync(fixture.log, 'utf8');
    const migratorBefore = (logBefore.match(/run --rm --no-deps migrator/gu) ?? []).length;
    assert.equal(migratorBefore, 1);
    const curlBefore = fs.readFileSync(fixture.curlLog, 'utf8');
    assert.match(
      curlBefore,
      /--resolve api\.example\.test:443:127\.0\.0\.1 https:\/\/api\.example\.test\/healthz/u,
    );
    assert.match(
      curlBefore,
      /--resolve web\.example\.test:443:127\.0\.0\.1 https:\/\/web\.example\.test\//u,
    );
    assert.match(
      curlBefore,
      /--resolve sync\.example\.test:443:127\.0\.0\.1 https:\/\/sync\.example\.test\/probes\/liveness/u,
    );
    assert.match(first.stdout, /host-local Caddy route probes passed/u);

    const second = run(fixture);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /already deployed production release/u);
    assert.match(second.stdout, /fast_path=state\+live-runtime; skipped component pulls/u);
    const stateAfter = fs.readFileSync(statePath, 'utf8');
    assert.equal(stateAfter, stateBefore);
    const logAfter = fs.readFileSync(fixture.log, 'utf8');
    const replayLog = logAfter.slice(logBefore.length);
    const migratorAfter = (logAfter.match(/run --rm --no-deps migrator/gu) ?? []).length;
    assert.equal(migratorAfter, 1);
    assert.match(replayLog, /^pull .*memoflow-production-runtime:production-selected$/mu);
    assert.doesNotMatch(
      replayLog,
      /^pull .*\/memoflow-(?:api|web|migrator|postgres|redis|powersync|caddy)@sha256:/mu,
    );
    assert.doesNotMatch(replayLog, /^create /mu);
    assert.doesNotMatch(replayLog, /^cp /mu);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('production watcher rejects a PowerSync downgrade before the migration boundary', () => {
  const fixture = setupFixture({ powersyncDowngrade: true });
  try {
    const result = run(fixture);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /PowerSync downgrade requires an explicit compatibility plan: 1\.25\.0 -> 1\.20\.4/u,
    );
    const log = fs.readFileSync(fixture.log, 'utf8');
    assert.doesNotMatch(log, /run --rm --no-deps migrator/u);
    const state = fs.readFileSync(path.join(fixture.state, 'production-deploy-state'), 'utf8');
    assert.doesNotMatch(state, /^status=BLOCKED$/mu);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('production runtime structurally forbids mutable image authority and unsafe datastore swaps', () => {
  const watcher = fs.readFileSync(watcherPath, 'utf8');
  const compose = fs.readFileSync(
    path.join(repoRoot, 'deployment/production/docker-compose.production.yml'),
    'utf8',
  );
  assert.match(watcher, /PostgreSQL image change requires a dedicated datastore migration plan/u);
  assert.ok(
    watcher.indexOf('mandatory pre-migration backup complete') <
      watcher.indexOf('migration_started=true'),
  );
  assert.match(watcher, /migration_started=true/u);
  assert.match(watcher, /status=BLOCKED/u);
  assert.match(watcher, /fail\(\) \{ log "ERROR: \$\*" >&2; return 1; \}/u);
  assert.doesNotMatch(compose, /watchtower|prod-latest/iu);
});
