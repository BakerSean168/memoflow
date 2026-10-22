import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  sha256,
  verifyControlArtifact,
  requireVersionForward,
  requireStaticRuntime,
  runtimePins,
  assertAlreadyDeployed,
  redactMessage,
} from './watch-contract.mjs';

const registry = 'crpi-3po0rmvmxgu205ms.cn-hangzhou.personal.cr.aliyuncs.com';
const namespace = 'bakersean';
const SHA = 'a'.repeat(40);
const CONTROL = 'b'.repeat(40);
const digest = (letter) => 'sha256:' + letter.repeat(64);

function buildControl() {
  const selected = {
    schema: 'memoflow.production-set/v1',
    releaseTag: 'v0.22.0',
    version: '0.22.0',
    gitSha: SHA,
    controlPlaneSha: CONTROL,
    digest: digest('c'),
    images: Object.fromEntries(
      ['api', 'web', 'migrator'].map((service, index) => [
        service,
        {
          repository: registry + '/' + namespace + '/memoflow-' + service,
          digest: digest(['d', 'e', 'f'][index]),
        },
      ]),
    ),
    runtime: Object.fromEntries(
      ['postgres', 'redis', 'powersync', 'caddy'].map((service) => [
        service,
        { repository: registry + '/' + namespace + '/memoflow-' + service, digest: digest('1') },
      ]),
    ),
  };
  const raw = Buffer.from(JSON.stringify(selected));
  const image = {
    Architecture: 'arm64',
    Config: {
      Labels: {
        'org.opencontainers.image.revision': CONTROL,
        'org.opencontainers.image.version': 'v0.22.0',
        'io.memoflow.release.revision': SHA,
        'io.memoflow.production-set.digest': selected.digest,
        'io.memoflow.production-set.sha256': sha256(raw),
      },
    },
  };
  return { selected, raw, image };
}

test('exact multi-arch selected production set binds source SHA and three immutable images', () => {
  const { selected, raw, image } = buildControl();
  const result = verifyControlArtifact(image, raw, registry, namespace);
  assert.deepEqual(result.selected, selected);
  assert.equal(result.imageRefs.web, 'ghcr.io/bakersean168/memoflow-web@' + digest('e'));
  assert.equal(result.productionSetDigest, digest('c'));
});

test('OCI checksum mismatch must reject tampered content before any deploy', () => {
  const { selected, image } = buildControl();
  const modified = Buffer.from(JSON.stringify({ ...selected, releaseTag: 'v0.22.1' }));
  assert.throws(() => verifyControlArtifact(image, modified, registry, namespace), /bytes differ/u);
});

test('reject altered control source, architecture and release versions', () => {
  const { raw, image } = buildControl();
  assert.throws(
    () => verifyControlArtifact({ ...image, Architecture: 'amd64' }, raw, registry, namespace),
    /arm64/u,
  );
  assert.throws(
    () =>
      verifyControlArtifact(
        {
          ...image,
          Config: {
            Labels: { ...image.Config.Labels, 'org.opencontainers.image.revision': 'bad' },
          },
        },
        raw,
        registry,
        namespace,
      ),
    /SHA/u,
  );
  assert.throws(
    () =>
      verifyControlArtifact(
        {
          ...image,
          Config: {
            Labels: { ...image.Config.Labels, 'org.opencontainers.image.version': 'v0.23.0' },
          },
        },
        raw,
        registry,
        namespace,
      ),
    /version mismatch/u,
  );
});

test('reject candidate registry mismatch even when OCI labels and raw checksum agree', () => {
  const { selected, image } = buildControl();
  selected.images.web.repository = 'ghcr.io/attacker/memoflow-web';
  const raw = Buffer.from(JSON.stringify(selected));
  image.Config.Labels['io.memoflow.production-set.sha256'] = sha256(raw);
  assert.throws(() => verifyControlArtifact(image, raw, registry, namespace), /registry/u);
});

test('reject non-immutable application and runtime identities', () => {
  const { selected, image } = buildControl();
  selected.images.api.digest = 'latest';
  const raw = Buffer.from(JSON.stringify(selected));
  image.Config.Labels['io.memoflow.production-set.sha256'] = sha256(raw);
  assert.throws(() => verifyControlArtifact(image, raw, registry, namespace), /immutable/u);
  selected.images.api.digest = digest('d');
  selected.runtime.caddy.digest = 'latest';
  const badRuntimeRaw = Buffer.from(JSON.stringify(selected));
  image.Config.Labels['io.memoflow.production-set.sha256'] = sha256(badRuntimeRaw);
  assert.throws(
    () => verifyControlArtifact(image, badRuntimeRaw, registry, namespace),
    /runtime image is unpinned/u,
  );
});

test('version progression allows next release but rejects same-version drift/downgrade', () => {
  assert.doesNotThrow(() => requireVersionForward('v0.22.0', 'v0.22.1'));
  assert.doesNotThrow(() => requireVersionForward('v0.22.0', 'v1.0.0'));
  assert.throws(() => requireVersionForward('v0.22.0', 'v0.22.0'), /same version/u);
  assert.throws(() => requireVersionForward('v0.22.0', 'v0.21.3'), /downgrade/u);
  assert.throws(() => requireVersionForward('v0.22.0', 'main'), /release tag/u);
});

test('PowerSync/Caddy/database runtime changes fail closed; unchanged stays acceptable', () => {
  const previous = buildControl().selected;
  const incoming = structuredClone(previous);
  assert.deepEqual(runtimePins(previous), runtimePins(incoming));
  assert.doesNotThrow(() => requireStaticRuntime(previous, incoming));
  for (const service of ['postgres', 'redis', 'powersync', 'caddy']) {
    const modified = structuredClone(incoming);
    modified.runtime[service].digest = digest('2');
    assert.throws(() => requireStaticRuntime(previous, modified), /own rollout/u);
  }
});

function deployedFixture() {
  const state = {
    status: 'DEPLOYED',
    version: '0.22.0',
    composeHash: digest('a'),
    envHash: digest('b'),
    appImages: { api: 'ghcr.io/owner/api@' + digest('a'), web: 'ghcr.io/owner/web@' + digest('b') },
    dataIds: { postgres: 'pg-id', redis: 'redis-id', caddy: 'edge-id' },
  };
  const serviceImages = {
    ...state.appImages,
    postgres: 'postgres-pin',
    redis: 'redis-pin',
    powersync: 'powersync-pin',
  };
  const current = {
    composeHash: state.composeHash,
    envHash: state.envHash,
    appVersion: state.version,
    serviceImages,
  };
  const containers = Object.fromEntries(
    Object.entries(serviceImages).map(([name, image]) => [
      name,
      { Id: name + '-id', State: { Health: { Status: 'healthy' } }, Config: { Image: image } },
    ]),
  );
  containers.postgres.Id = 'pg-id';
  containers.redis.Id = 'redis-id';
  const caddy = { Id: 'edge-id', State: { Running: true } };
  return { state, current, containers, caddy };
}

test('unchanged, healthy selected release is a pure no-op candidate', () => {
  const { state, current, containers, caddy } = deployedFixture();
  assert.equal(assertAlreadyDeployed(state, current, containers, caddy), true);
});

test('restart or drift of Postgres/Redis/Caddy is an operator gate', () => {
  for (const service of ['postgres', 'redis', 'caddy']) {
    const fixture = deployedFixture();
    if (service === 'caddy') fixture.caddy.Id = 'another-shared-edge';
    else fixture.containers[service].Id = 'different-db-container';
    assert.throws(
      () =>
        assertAlreadyDeployed(fixture.state, fixture.current, fixture.containers, fixture.caddy),
      /changed|replaced/u,
    );
  }
});

test('image mismatch, missing health and modified production env fail closed', () => {
  const fixture = deployedFixture();
  fixture.current.appVersion = '0.21.1';
  assert.throws(
    () => assertAlreadyDeployed(fixture.state, fixture.current, fixture.containers, fixture.caddy),
    /drift/u,
  );
  const fixture2 = deployedFixture();
  fixture2.containers.api.Config.Image = 'retired-tag';
  assert.throws(
    () =>
      assertAlreadyDeployed(fixture2.state, fixture2.current, fixture2.containers, fixture2.caddy),
    /image/u,
  );
  const fixture3 = deployedFixture();
  fixture3.containers.powersync.State.Health.Status = 'unhealthy';
  assert.throws(
    () =>
      assertAlreadyDeployed(fixture3.state, fixture3.current, fixture3.containers, fixture3.caddy),
    /not healthy/u,
  );
});

test('errors are bounded to a single safe line', () => {
  assert.equal(redactMessage(new Error('bad\nstate\r\ncannot continue')), 'bad');
  assert.equal(redactMessage('a'.repeat(400)).length, 250);
});
