import assert from 'node:assert/strict';
import test from 'node:test';
import { createCandidateSet } from '../candidate-manifest.mjs';
import {
  createProductionSet,
  productionSetDigest,
  validateProductionSet,
} from '../production-manifest.mjs';

const gitSha = 'a'.repeat(40);
const digest = (char) => `sha256:${char.repeat(64)}`;
const registry = 'registry.example.test';
const namespace = 'memoflow';
const candidateTag = `sha-${gitSha}`;
const controlPlaneSha = 'f'.repeat(40);
const candidateImage = (name, char) => ({
  tag: candidateTag,
  digest: digest(char),
  revision: gitSha,
  distributions: {
    china: {
      repository: `${registry}/${namespace}/memoflow-${name}`,
      tag: candidateTag,
      digest: digest(char),
    },
    global: {
      repository: `ghcr.io/test/memoflow-${name}`,
      tag: candidateTag,
      digest: digest(char),
    },
  },
});
const candidate = createCandidateSet({
  gitSha,
  ciRunId: '42',
  deliveryManifestDigest: digest('d'),
  ciEvidence: {
    kind: 'ci-chain-v1',
    commit: gitSha,
    tree: 'e'.repeat(40),
    ciRunId: 42,
    deliveryManifestDigest: digest('d').slice(7),
    testEvidence: { testRunId: 42, testedCommit: gitSha, testedTree: 'e'.repeat(40) },
    buildArtifactId: 123,
    buildArtifactDigest: `sha256:${'f'.repeat(64)}`,
  },
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
    tags: ['v0.13.0', `v0.13.0-${gitSha.slice(0, 12)}`],
    digest: source.digest,
    distributions: {
      china: { ...source.distributions.china, tags: ['v0.13.0'] },
      global: { ...source.distributions.global, tags: ['v0.13.0'] },
    },
  };
};
const release = {
  schemaVersion: 2,
  kind: 'memoflow-release',
  version: '0.13.0',
  tag: 'v0.13.0',
  gitSha,
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
  images: ['postgres', 'redis', 'caddy', 'powersync', 'watchtower'].map((name, index) => {
    const hex = ['4', '5', '6', '7', '8'][index];
    const fullDigest = digest(hex);
    return {
      name: `memoflow-${name}`,
      source: `docker.io/example/${name}@${fullDigest}`,
      tag: `fixture-${fullDigest.slice(7, 19)}`,
      platform: 'linux/amd64',
    };
  }),
};

test('production-set/v1 binds a Published release identity, exact server digests, and runtime mirrors', () => {
  const productionSet = createProductionSet({
    release,
    candidate,
    mirrorConfig,
    registry,
    namespace,
    controlPlaneSha,
  });
  assert.deepEqual(validateProductionSet(productionSet), []);
  assert.equal(productionSet.releaseTag, 'v0.13.0');
  assert.equal(productionSet.gitSha, gitSha);
  assert.equal(productionSet.controlPlaneSha, controlPlaneSha);
  assert.equal(productionSet.candidateSetDigest, candidate.digest);
  assert.equal(productionSet.images.api.digest, digest('2'));
  assert.equal(productionSet.images.api.repository, `${registry}/${namespace}/memoflow-api`);
  assert.equal(productionSet.runtime.powersync.digest, digest('7'));
  assert.equal(
    productionSet.runtime.powersync.repository,
    `${registry}/${namespace}/memoflow-powersync`,
  );
});

test('production-set is deterministic and contains no selection timestamp', () => {
  const first = createProductionSet({
    release,
    candidate,
    mirrorConfig,
    registry,
    namespace,
    controlPlaneSha,
  });
  const second = createProductionSet({
    release,
    candidate,
    mirrorConfig,
    registry,
    namespace,
    controlPlaneSha,
  });
  assert.deepEqual(first, second);
  assert.equal(first.digest, productionSetDigest(first));
  assert.equal('selectedAt' in first, false);

  const extraField = { ...first, selectedAt: '2026-09-05T01:00:00Z' };
  assert.match(
    validateProductionSet(extraField).join('; '),
    /production set fields must be exactly/u,
  );
});

test('production selection fails closed on release/candidate drift and tampering', () => {
  assert.throws(
    () =>
      createProductionSet({
        release: { ...release, gitSha: 'b'.repeat(40) },
        candidate,
        mirrorConfig,
        registry,
        namespace,
        controlPlaneSha,
      }),
    /release gitSha must equal candidate gitSha/u,
  );
  const productionSet = createProductionSet({
    release,
    candidate,
    mirrorConfig,
    registry,
    namespace,
    controlPlaneSha,
  });
  productionSet.images.web.digest = digest('e');
  assert.match(validateProductionSet(productionSet).join('; '), /production set digest mismatch/u);

  const runtimeTamper = createProductionSet({
    release,
    candidate,
    mirrorConfig,
    registry,
    namespace,
    controlPlaneSha,
  });
  runtimeTamper.runtime.powersync.tag = '1.25.0-wrongdigest';
  assert.match(
    validateProductionSet(runtimeTamper).join('; '),
    /runtime\.powersync\.tag must bind digest prefix/u,
  );
});

test('production selection excludes Watchtower from runtime ownership', () => {
  const productionSet = createProductionSet({
    release,
    candidate,
    mirrorConfig,
    registry,
    namespace,
    controlPlaneSha,
  });
  assert.deepEqual(Object.keys(productionSet.runtime).sort(), [
    'caddy',
    'postgres',
    'powersync',
    'redis',
  ]);
  assert.equal('watchtower' in productionSet.runtime, false);
});
