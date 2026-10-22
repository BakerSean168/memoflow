#!/usr/bin/env node
/**
 * Oracle2-only production-selected reconciler.
 *
 * Unlike the retired Alibaba watcher, this NEVER owns ports 80/443, Caddy,
 * PG/Redis data, PowerSync image versions, networks or persistent volumes.
 * The first run requires an explicit adoption of the already-verified
 * production deployment. Same-release checks only inspect state and exit.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createGunzip, createGzip } from 'node:zlib';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  CONTROL_IMAGE,
  ORACLE_PROJECT,
  APP_SERVICES,
  LIVE_SERVICES,
  FULL_SHA,
  DIGEST,
  sha256,
  verifyControlArtifact,
  requireVersionForward,
  runtimePins,
  assertAlreadyDeployed,
  redactMessage,
} from './watch-contract.mjs';

const ROOT = '/opt/memoflow-oracle2';
const STATE_ROOT = '/var/lib/memoflow-oracle2-delivery';
const COMPOSE_FILE = path.join(ROOT, 'compose.yaml');
const ENV_FILE = path.join(ROOT, 'production.env');
const STATE_FILE = path.join(STATE_ROOT, 'oracle2-watch-state.json');
const MANUAL_STATE_FILE = path.join(STATE_ROOT, 'production-app-only-state.json');
const URLS = Object.freeze([
  ['memoflow.bakersean.top', '/'],
  ['memoflowapi.bakersean.top', '/healthz'],
  ['memoflowsync.bakersean.top', '/probes/liveness'],
  ['memoflowapi.bakersean.top', '/api/auth/get-session'],
]);

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      timeout: options.timeout ?? 45_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    // Child stdout/stderr may contain private env values. Never propagate.
    throw new Error(
      'command failed: ' +
        command +
        ' ' +
        (args[0] ?? '') +
        ' (' +
        String(error.status ?? error.code ?? 'unknown') +
        ')',
    );
  }
}

function docker(...args) {
  return run('docker', args);
}

function liveIds(service) {
  return docker(
    'ps',
    '-q',
    '--filter',
    'label=com.docker.compose.project=' + ORACLE_PROJECT,
    '--filter',
    'label=com.docker.compose.service=' + service,
  )
    .split(/\s+/u)
    .filter(Boolean);
}

function singleLive(service) {
  const ids = liveIds(service);
  if (ids.length !== 1) throw new Error('expected one running Oracle2 ' + service + ' container');
  return JSON.parse(docker('inspect', ids[0]))[0];
}

function liveSnapshot() {
  const containers = Object.fromEntries(LIVE_SERVICES.map((name) => [name, singleLive(name)]));
  const caddy = JSON.parse(docker('inspect', 'cpa-caddy'))[0];
  return { containers, caddy };
}

function composeConfig(compose, env) {
  return JSON.parse(
    docker(
      'compose',
      '-p',
      ORACLE_PROJECT,
      '--project-directory',
      ROOT,
      '-f',
      compose,
      '--env-file',
      env,
      'config',
      '--format',
      'json',
    ),
  );
}

function envKey(env, name) {
  const lines = env.match(new RegExp('^' + name + '=(.*)$', 'gm')) ?? [];
  if (lines.length !== 1) throw new Error('missing or duplicate Oracle2 env ' + name);
  return lines[0].slice(name.length + 1).replace(/^['"]|['"]$/gu, '');
}

function currentFiles() {
  const compose = fs.readFileSync(COMPOSE_FILE, 'utf8');
  const env = fs.readFileSync(ENV_FILE, 'utf8');
  const resolved = composeConfig(COMPOSE_FILE, ENV_FILE);
  return {
    compose,
    env,
    resolved,
    composeHash: sha256(compose),
    envHash: sha256(env),
    appVersion: envKey(env, 'APP_VERSION'),
    serviceImages: Object.fromEntries(
      LIVE_SERVICES.map((service) => [service, resolved.services[service]?.image]),
    ),
  };
}

function controlImage() {
  // It only updates the local image cache. It NEVER deploys an application.
  docker('pull', '--quiet', CONTROL_IMAGE);
  return JSON.parse(docker('image', 'inspect', CONTROL_IMAGE))[0];
}

function labelsFromControl(image) {
  if (image.Architecture !== 'arm64') throw new Error('control image must be linux/arm64');
  const labels = image.Config?.Labels ?? {};
  if (
    !FULL_SHA.test(labels['io.memoflow.release.revision'] ?? '') ||
    !FULL_SHA.test(labels['org.opencontainers.image.revision'] ?? '') ||
    !DIGEST.test(labels['io.memoflow.production-set.digest'] ?? '') ||
    !DIGEST.test(labels['io.memoflow.production-set.sha256'] ?? '')
  ) {
    throw new Error('production-selected control OCI labels invalid');
  }
  return labels;
}

function extractControl(image, labels, env, stage) {
  const id = docker('create', CONTROL_IMAGE, '/bin/true');
  try {
    docker('cp', id + ':/runtime/production/.', stage + '/');
  } finally {
    docker('rm', '-f', id);
  }
  for (const required of [
    'production-set-v1.json',
    'oracle2-compose-candidate.mjs',
    'oracle2-release-preview.mjs',
    'oracle2-topology-preflight.mjs',
  ]) {
    if (!fs.statSync(path.join(stage, required), { throwIfNoEntry: false })?.isFile()) {
      throw new Error('trusted control bundle missing ' + required);
    }
  }
  const registry = envKey(env, 'REGISTRY');
  const namespace = envKey(env, 'IMAGE_NAMESPACE');
  const raw = fs.readFileSync(path.join(stage, 'production-set-v1.json'));
  const result = verifyControlArtifact(image, raw, registry, namespace);
  if (
    result.releaseSha !== labels['io.memoflow.release.revision'] ||
    result.controlSha !== labels['org.opencontainers.image.revision']
  ) {
    throw new Error('selected source revision inconsistency');
  }
  return result;
}

function verifyTopologicalSafety(stage) {
  run(process.execPath, [
    path.join(stage, 'oracle2-topology-preflight.mjs'),
    '--compose',
    COMPOSE_FILE,
    '--env-file',
    ENV_FILE,
  ]);
}

async function stageCompose(stage, selected, current) {
  const contract = await import(
    pathToFileURL(path.join(stage, 'oracle2-compose-candidate.mjs')).href
  );
  const nextCompose = contract.renderOracle2ComposeCandidate(current.compose, selected.imageRefs);
  const nextEnv = contract.renderOracle2EnvCandidate(current.env, selected.selected.version);
  const nextComposeFile = path.join(stage, 'oracle2-candidate.compose.yaml');
  const nextEnvFile = path.join(stage, 'oracle2-candidate.env');
  fs.writeFileSync(nextComposeFile, nextCompose, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(nextEnvFile, nextEnv, { mode: 0o600, flag: 'wx' });
  contract.assertOracle2ComposeCandidate(
    current.resolved,
    composeConfig(nextComposeFile, nextEnvFile),
    selected.imageRefs,
    selected.selected.version,
  );
  return { compose: nextCompose, env: nextEnv, composeFile: nextComposeFile, envFile: nextEnvFile };
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function writeState(payload) {
  const filename = STATE_FILE + '.next-' + process.pid;
  fs.writeFileSync(filename, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  fs.renameSync(filename, STATE_FILE);
}

function stateFrom(selected, current, snapshot, additional = {}) {
  return {
    schema: 'memoflow.oracle2-watcher/v1',
    status: 'DEPLOYED',
    releaseTag: selected.selected.releaseTag,
    version: selected.selected.version,
    releaseSha: selected.releaseSha,
    controlPlaneSha: selected.controlSha,
    productionSetDigest: selected.productionSetDigest,
    composeHash: current.composeHash,
    envHash: current.envHash,
    appImages: {
      api: selected.imageRefs.api,
      web: selected.imageRefs.web,
    },
    runtimePins: runtimePins(selected.selected),
    dataIds: {
      postgres: snapshot.containers.postgres.Id,
      redis: snapshot.containers.redis.Id,
      caddy: snapshot.caddy.Id,
    },
    ...additional,
  };
}

function assertCurrentState(state, current, snapshot) {
  if (state.schema !== 'memoflow.oracle2-watcher/v1') {
    throw new Error('unknown watcher state schema');
  }
  return assertAlreadyDeployed(state, current, snapshot.containers, snapshot.caddy);
}

function assertSelectedMatchesLive(selected, current) {
  assert.equal(
    current.appVersion,
    selected.selected.version,
    'current app version differs from selected',
  );
  for (const service of ['api', 'web', 'migrator']) {
    assert.equal(
      current.resolved.services[service]?.image,
      selected.imageRefs[service],
      'Oracle2 current ' + service + ' image differs from selected release',
    );
  }
}

function verifyApiImages(selected) {
  for (const service of APP_SERVICES) {
    const ref = selected.imageRefs[service];
    docker('pull', '--quiet', ref);
    const inspect = JSON.parse(docker('image', 'inspect', ref))[0];
    if (
      inspect.Architecture !== 'arm64' ||
      inspect.Config?.Labels?.['org.opencontainers.image.revision'] !== selected.releaseSha ||
      !inspect.RepoDigests?.includes(ref)
    ) {
      throw new Error(service + ' selected immutable arm64 OCI digest/revision mismatch');
    }
  }
}

async function checkUrls() {
  for (const [host, urlPath] of URLS) {
    const got = run(
      'curl',
      [
        '--silent',
        '--show-error',
        '--connect-timeout',
        '5',
        '--max-time',
        '15',
        '--resolve',
        host + ':443:127.0.0.1',
        '--output',
        '/dev/null',
        '--write-out',
        '%{http_code}|%{ssl_verify_result}',
        'https://' + host + urlPath,
      ],
      { timeout: 18_000 },
    );
    if (got !== '200|0') throw new Error('Oracle2 trusted HTTPS probe failed: ' + host + urlPath);
  }
}

function compose(cf, ef, args, timeout = 150_000) {
  return run(
    'docker',
    [
      'compose',
      '-p',
      ORACLE_PROJECT,
      '--project-directory',
      ROOT,
      '-f',
      cf,
      '--env-file',
      ef,
      ...args,
    ],
    { timeout },
  );
}

async function waitHealthy(service, timeoutMs = 150_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (singleLive(service).State.Health?.Status === 'healthy') return;
    } catch {
      // Docker Compose can temporarily replace a service during start.
    }
    await sleep(3000);
  }
  throw new Error(service + ' health gate timed out');
}

async function createBackup(previous, current, snapshot, target) {
  const stat = fs.statfsSync(ROOT);
  if (Number(stat.bavail) * Number(stat.bsize) < 4 * 1024 ** 3) {
    throw new Error('not enough free disk for mandatory production backup');
  }
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\..+$/u, 'Z');
  const folder = path.join(
    STATE_ROOT,
    'backups',
    'auto-' + target.selected.releaseTag + '-' + stamp,
  );
  fs.mkdirSync(folder, { mode: 0o700, recursive: true });
  fs.chmodSync(folder, 0o700);
  const envBefore = path.join(folder, 'production.before.env');
  fs.writeFileSync(path.join(folder, 'compose.before.yaml'), current.compose, { mode: 0o600 });
  fs.writeFileSync(envBefore, current.env, { mode: 0o600 });
  fs.writeFileSync(
    path.join(folder, 'watcher-state.before.json'),
    JSON.stringify(previous, null, 2) + '\n',
    { mode: 0o600 },
  );
  const pg = snapshot.containers.postgres.Id;
  const dump = path.join(folder, 'postgres.sql.gz');
  const worker = spawn(
    'docker',
    ['exec', pg, 'sh', '-lc', 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  // Drain stderr without copying potentially sensitive database diagnostics to logs.
  worker.stderr.resume();
  const finished = new Promise((resolve) => worker.once('close', resolve));
  await pipeline(
    worker.stdout,
    createGzip({ level: 6 }),
    createWriteStream(dump, { mode: 0o600, flags: 'wx' }),
  );
  if ((await finished) !== 0) throw new Error('PostgreSQL dump subprocess failed');
  let uncompressedBytes = 0;
  await pipeline(
    createReadStream(dump),
    createGunzip(),
    new Writable({
      write(bytes, _encoding, callback) {
        uncompressedBytes += bytes.length;
        callback();
      },
    }),
  );
  if (uncompressedBytes < 1024) throw new Error('PostgreSQL backup empty');
  const backupDigest = sha256(fs.readFileSync(dump));
  const record = {
    schema: 'memoflow.oracle2-watcher-backup/v1',
    releaseTag: target.selected.releaseTag,
    releaseSha: target.releaseSha,
    createdAt: new Date().toISOString(),
    previousProductionSet: previous.productionSetDigest,
    nextProductionSet: target.productionSetDigest,
    pgContainer: pg,
    composeHash: current.composeHash,
    envHash: current.envHash,
    dumpDigest: backupDigest,
    uncompressedBytes,
    dataIds: previous.dataIds,
  };
  fs.writeFileSync(
    path.join(folder, 'backup-receipt.json'),
    JSON.stringify(record, null, 2) + '\n',
    { mode: 0o600 },
  );
  if (sha256(fs.readFileSync(dump)) !== backupDigest) throw new Error('backup changed on disk');
  return { folder, record };
}

function compareDataContainers(original, current) {
  for (const name of ['postgres', 'redis']) {
    if (original.containers[name].Id !== current.containers[name].Id) {
      throw new Error('production ' + name + ' replaced during deployment');
    }
  }
  if (original.caddy.Id !== current.caddy.Id) {
    throw new Error('shared CPA Caddy was changed during deployment');
  }
}

async function rollout(previous, current, original, target, candidate, stage) {
  // A state transition is atomic; any uncertain mutation leaves an explicit
  // BLOCKED record, never a retry loop or blind post-migration rollback.
  const backup = await createBackup(previous, current, original, target);
  compareDataContainers(original, liveSnapshot());
  if (
    sha256(fs.readFileSync(COMPOSE_FILE)) !== current.composeHash ||
    sha256(fs.readFileSync(ENV_FILE)) !== current.envHash
  ) {
    throw new Error('production files changed during mandatory backup');
  }
  const progressing = {
    ...previous,
    status: 'APPLYING',
    targetRelease: target.selected.releaseTag,
    nextProductionSet: target.productionSetDigest,
    startedAt: new Date().toISOString(),
    backupDir: backup.folder,
  };
  writeState(progressing);
  let migrationStarted = false;
  try {
    console.log('ORACLE2_WATCH_STEP=STOP_OLD_APP');
    compose(COMPOSE_FILE, ENV_FILE, ['stop', 'web', 'powersync', 'api'], 120_000);
    migrationStarted = true;
    console.log('ORACLE2_WATCH_STEP=MIGRATE');
    compose(
      candidate.composeFile,
      candidate.envFile,
      ['run', '--rm', '-T', '--no-deps', 'migrator'],
      240_000,
    );
    console.log('ORACLE2_WATCH_STEP=API');
    compose(candidate.composeFile, candidate.envFile, [
      'up',
      '-d',
      '--no-deps',
      '--no-build',
      'api',
    ]);
    await waitHealthy('api');
    console.log('ORACLE2_WATCH_STEP=POWERSYNC');
    compose(candidate.composeFile, candidate.envFile, [
      'up',
      '-d',
      '--no-deps',
      '--no-build',
      'powersync',
    ]);
    await waitHealthy('powersync');
    console.log('ORACLE2_WATCH_STEP=WEB');
    compose(candidate.composeFile, candidate.envFile, [
      'up',
      '-d',
      '--no-deps',
      '--no-build',
      'web',
    ]);
    await waitHealthy('web');
    const ready = liveSnapshot();
    compareDataContainers(original, ready);
    for (const service of ['api', 'web']) {
      if (ready.containers[service].Config.Image !== target.imageRefs[service]) {
        throw new Error(service + ' live image digest mismatch after rollout');
      }
    }
    await checkUrls();
    const composeTemp = COMPOSE_FILE + '.watch-next-' + process.pid;
    const envTemp = ENV_FILE + '.watch-next-' + process.pid;
    fs.writeFileSync(composeTemp, candidate.compose, { mode: 0o644, flag: 'wx' });
    fs.writeFileSync(envTemp, candidate.env, { mode: 0o600, flag: 'wx' });
    fs.renameSync(envTemp, ENV_FILE);
    fs.renameSync(composeTemp, COMPOSE_FILE);
    verifyTopologicalSafety(stage);
    const now = currentFiles();
    const settled = stateFrom(target, now, ready, {
      adoptedAt: previous.adoptedAt,
      deployedAt: new Date().toISOString(),
      previousRelease: previous.releaseTag,
      backupDir: backup.folder,
    });
    assertCurrentState(settled, now, ready);
    writeState(settled);
    console.log('ORACLE2_WATCH_DEPLOY=PASS release=' + target.selected.releaseTag);
  } catch (error) {
    writeState({
      ...progressing,
      status: 'BLOCKED',
      migrationStarted,
      failure: redactMessage(error),
      failedAt: new Date().toISOString(),
    });
    if (!migrationStarted) {
      try {
        compose(COMPOSE_FILE, ENV_FILE, [
          'up',
          '-d',
          '--no-deps',
          '--no-build',
          'api',
          'powersync',
          'web',
        ]);
      } catch {
        // A pre-migration app restore is best effort, but the ledger is BLOCKED.
      }
    }
    throw error;
  }
}

async function reconcile(mode) {
  if (process.getuid?.() !== 0) throw new Error('Oracle2 watcher requires root');
  fs.mkdirSync(STATE_ROOT, { recursive: true, mode: 0o700 });
  const current = currentFiles();
  const image = controlImage();
  const labels = labelsFromControl(image);
  const old = readState();
  const selectedSha = labels['io.memoflow.production-set.digest'];
  if (old?.status && old.status !== 'DEPLOYED') {
    throw new Error('watcher state is BLOCKED/APPLYING; inspect backup before recovery');
  }
  const snapshot = liveSnapshot();
  // This check includes non-image topology, bind mounts, networks and health.
  if (old) assertCurrentState(old, current, snapshot);
  const stage = fs.mkdtempSync(path.join(STATE_ROOT, 'watch-next-'));
  fs.chmodSync(stage, 0o700);
  try {
    const target = extractControl(image, labels, current.env, stage);
    verifyTopologicalSafety(stage);
    if (old && old.productionSetDigest === selectedSha) {
      if (
        old.releaseSha !== target.releaseSha ||
        old.controlPlaneSha !== target.controlSha ||
        old.releaseTag !== target.selected.releaseTag ||
        old.runtimePins == null
      ) {
        throw new Error('unchanged production-set identity differs from watcher ledger');
      }
      await checkUrls();
      console.log('ORACLE2_WATCH=NO_CHANGE release=' + old.releaseTag);
      return;
    }
    if (old && old.productionSetDigest !== selectedSha) {
      requireVersionForward(old.releaseTag, target.selected.releaseTag);
      assert.deepEqual(
        runtimePins(target.selected),
        old.runtimePins,
        'runtime dependency image changed; separate datastore/edge plan required',
      );
    }
    const candidate = await stageCompose(stage, target, current);
    if (mode === '--adopt-current') {
      if (old) throw new Error('initial adoption is already complete');
      if (target.selected.releaseTag !== 'v0.22.0') {
        throw new Error('first adoption requires the verified v0.22.0 production baseline');
      }
      const previousManual = JSON.parse(fs.readFileSync(MANUAL_STATE_FILE, 'utf8'));
      if (
        previousManual.status !== 'DEPLOYED' ||
        previousManual.releaseSha !== target.releaseSha ||
        previousManual.productionSetDigest !== target.productionSetDigest
      ) {
        throw new Error('manual operator deployment ledger does not match selected release');
      }
      assertSelectedMatchesLive(target, current);
      const adopted = stateFrom(target, current, snapshot, {
        adoptedAt: new Date().toISOString(),
        adoptionEvidence: sha256(fs.readFileSync(MANUAL_STATE_FILE)),
      });
      assertCurrentState(adopted, current, snapshot);
      await checkUrls();
      writeState(adopted);
      console.log('ORACLE2_WATCH_ADOPT=PASS release=' + target.selected.releaseTag);
      return;
    }
    if (!old) {
      if (mode === '--check-only') {
        assertSelectedMatchesLive(target, current);
        await checkUrls();
        console.log('ORACLE2_WATCH=READY_TO_ADOPT release=' + target.selected.releaseTag);
        return;
      }
      throw new Error('first Oracle2 watcher run requires explicit --adopt-current');
    }
    if (mode === '--check-only') {
      console.log('ORACLE2_WATCH=PENDING_RELEASE release=' + target.selected.releaseTag);
      return;
    }
    verifyApiImages(target);
    await checkUrls();
    await rollout(old, current, snapshot, target, candidate, stage);
  } finally {
    // All temporary images/secret candidate files are root-only and are
    // removed. Full pre-migration copies survive in a root-only backup folder.
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

function main() {
  if (
    process.argv.length !== 3 ||
    !['--check-only', '--adopt-current', '--run-once'].includes(process.argv[2])
  ) {
    throw new Error('usage: watch.mjs --check-only|--adopt-current|--run-once');
  }
  return reconcile(process.argv[2]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('ORACLE2_WATCH=FAIL ' + redactMessage(error));
    process.exitCode = 1;
  });
}
