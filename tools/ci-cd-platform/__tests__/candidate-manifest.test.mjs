import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateSetDigest,
  createCandidateSet,
  validateCandidateSet,
} from '../candidate-manifest.mjs';

const oci = (char) => `sha256:${char.repeat(64)}`;
const gitSha = 'a'.repeat(40);
const tag = `sha-${gitSha}`;

function image(component, char) {
  const digest = oci(char);
  return {
    tag,
    digest,
    revision: gitSha,
    distributions: {
      china: {
        repository: `registry.example.cn/memoflow/memoflow-${component}`,
        tag,
        digest,
      },
      global: {
        repository: `ghcr.io/example/memoflow-${component}`,
        tag,
        digest,
      },
    },
  };
}

function input() {
  return {
    gitSha,
    ciRunId: '123456',
    deliveryManifestDigest: oci('d'),
    ciEvidence: {
      kind: 'ci-chain-v1',
      commit: gitSha,
      tree: 'e'.repeat(40),
      ciRunId: 123456,
      deliveryManifestDigest: oci('d').slice(7),
      testEvidence: { testRunId: 123456, testedCommit: gitSha, testedTree: 'e'.repeat(40) },
      buildArtifactId: 123,
      buildArtifactDigest: `sha256:${'f'.repeat(64)}`,
    },
    images: {
      web: image('web', '1'),
      api: image('api', '2'),
      migrator: image('migrator', '3'),
    },
    generatedAt: '2026-09-05T00:00:00.000Z',
  };
}

test('candidate-set/v1 binds one exact revision and dual-registry digest parity', () => {
  const candidate = createCandidateSet(input());
  assert.deepEqual(validateCandidateSet(candidate), []);
  assert.equal(candidate.candidateTag, tag);
  assert.equal(candidate.images.api.distributions.china.digest, candidate.images.api.digest);
  assert.equal(candidate.images.api.distributions.global.digest, candidate.images.api.digest);
  assert.match(candidate.digest, /^sha256:[0-9a-f]{64}$/u);
});

test('candidate-set self digest is deterministic and ignores generatedAt', () => {
  const first = createCandidateSet(input());
  const second = createCandidateSet({ ...input(), generatedAt: '2026-09-06T00:00:00.000Z' });
  assert.equal(first.digest, second.digest);
  assert.equal(candidateSetDigest(first), first.digest);
});

test('candidate-set fails closed on mixed revision, registry digest drift, and tampering', () => {
  const candidate = createCandidateSet(input());
  candidate.images.api.revision = 'b'.repeat(40);
  candidate.images.web.distributions.global.digest = oci('9');
  candidate.images.migrator.tag = 'staging-latest';
  candidate.deliveryManifestDigest = 'not-a-digest';
  const errors = validateCandidateSet(candidate);
  assert.ok(errors.some((error) => error.includes('api.revision')));
  assert.ok(errors.some((error) => error.includes('web.distributions.global.digest')));
  assert.ok(errors.some((error) => error.includes('migrator.tag')));
  assert.ok(errors.some((error) => error.includes('deliveryManifestDigest')));
  assert.ok(errors.some((error) => error.includes('candidate digest mismatch')));
});

test('candidate-set rejects missing or extra application components', () => {
  const missing = createCandidateSet(input());
  delete missing.images.migrator;
  assert.ok(
    validateCandidateSet(missing).some((error) => error.includes('images must contain exactly')),
  );

  const extraInput = input();
  extraInput.images.runtime = image('runtime', '4');
  const extra = createCandidateSet(extraInput);
  assert.ok(
    validateCandidateSet(extra).some((error) => error.includes('images must contain exactly')),
  );
});
