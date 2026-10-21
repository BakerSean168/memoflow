import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderOracle2ComposeCandidate,
  renderOracle2EnvCandidate,
  assertOracle2ComposeCandidate,
  releaseImageRefs,
} from '../oracle2-compose-candidate.mjs';

const digest = (hex) => `sha256:${hex.repeat(64)}`;
const registry = 'example.invalid';
const namespace = 'memo';
const refs = Object.fromEntries(
  ['api', 'web', 'migrator'].map((service, index) => [
    service,
    `${registry}/${namespace}/memoflow-${service}@${digest(String(index + 1))}`,
  ]),
);

const compose = `services:
  postgres:
    image: pgvector/pgvector:0.8.5-pg18
    volumes:
      - data:/var/lib/postgresql
  redis:
    image: redis:8-alpine
  api:
    image: memoflow-oracle2-api:rc-old
    environment:
      APP_VERSION: \${APP_VERSION:-0.3.0}
    ports:
      - 172.18.0.1:20701:3000
  migrator:
    image: memoflow-oracle2-migrator:rc-old
  powersync:
    image: journeyapps/powersync-service:1.25.0
  web:
    image: memoflow-oracle2-web:rc-old
    ports:
      - 172.18.0.1:20700:80
volumes:
  data:
`;

const currentConfig = {
  services: {
    postgres: { image: 'pgvector/pgvector:0.8.5-pg18', volumes: ['data:/var/lib/postgresql'] },
    redis: { image: 'redis:8-alpine' },
    api: {
      image: 'memoflow-oracle2-api:rc-old',
      environment: { APP_VERSION: '0.21.1' },
      ports: [{ published: '20701', host_ip: '172.18.0.1' }],
    },
    migrator: { image: 'memoflow-oracle2-migrator:rc-old' },
    powersync: { image: 'journeyapps/powersync-service:1.25.0' },
    web: {
      image: 'memoflow-oracle2-web:rc-old',
      ports: [{ published: '20700', host_ip: '172.18.0.1' }],
    },
  },
  volumes: { data: { name: 'memoflow-oracle2_data' } },
};

const nextConfig = () => {
  const out = structuredClone(currentConfig);
  for (const [service, ref] of Object.entries(refs)) out.services[service].image = ref;
  out.services.api.environment.APP_VERSION = '0.21.3';
  return out;
};

test('Oracle2 release candidate updates only three exact application references', () => {
  const result = renderOracle2ComposeCandidate(compose, refs);
  for (const [service, ref] of Object.entries(refs)) {
    assert.match(result, new RegExp(`    image: ${ref.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}`));
    assert.ok(!result.includes(`memoflow-oracle2-${service}:rc-old`));
  }
  assert.ok(result.includes('image: pgvector/pgvector:0.8.5-pg18'));
  assert.ok(result.includes('image: journeyapps/powersync-service:1.25.0'));
  assert.ok(result.includes('172.18.0.1:20700:80'));
  assert.equal(result.split('\n').length, compose.split('\n').length);
  assert.equal(
    renderOracle2EnvCandidate('DB_PASSWORD=secret\nAPP_VERSION=0.21.1\n', '0.21.3'),
    'DB_PASSWORD=secret\nAPP_VERSION=0.21.3\n',
  );
});

test('Oracle2 candidate preserves networks, volumes, ports and shared Caddy ownership', () => {
  assert.equal(assertOracle2ComposeCandidate(currentConfig, nextConfig(), refs, '0.21.3'), true);
  for (const change of [
    (c) => (c.services.web.ports[0].published = '80'),
    (c) => (c.services.api.environment.DB_PASSWORD = 'changed'),
    (c) => (c.volumes.data.name = 'new_volume'),
    (c) => (c.services.caddy = { image: 'caddy:2', ports: [{ published: '443' }] }),
  ]) {
    const candidate = nextConfig();
    change(candidate);
    assert.throws(() => assertOracle2ComposeCandidate(currentConfig, candidate, refs, '0.21.3'));
  }
});

test('Oracle2 candidate rejects injected refs and ambiguous service/env declarations', () => {
  assert.throws(() => renderOracle2ComposeCandidate(compose, { ...refs, api: 'api:latest' }));
  assert.throws(() => renderOracle2ComposeCandidate(compose.replace('  api:\n', ''), refs));
  assert.throws(() =>
    renderOracle2ComposeCandidate(compose + '  api:\n    image: duplicate\n', refs),
  );
  assert.throws(() =>
    renderOracle2EnvCandidate('APP_VERSION=0.21.1\nAPP_VERSION=0.21.2\n', '0.21.3'),
  );
  assert.throws(() => renderOracle2EnvCandidate('APP_VERSION=0.21.1\n', 'latest'));
});

test('Oracle2 release images must belong to approved repository and exact digest', () => {
  const data = {
    schema: 'memoflow.production-set/v1',
    releaseTag: 'v0.21.3',
    images: Object.fromEntries(
      Object.entries(refs).map(([service, ref]) => [
        service,
        { repository: `${registry}/${namespace}/memoflow-${service}`, digest: ref.split('@')[1] },
      ]),
    ),
  };
  assert.deepEqual(releaseImageRefs(data, registry, namespace), {
    images: refs,
    version: '0.21.3',
  });
  const wrong = structuredClone(data);
  wrong.images.api.repository = 'attacker.invalid/memo/memoflow-api';
  assert.throws(() => releaseImageRefs(wrong, registry, namespace));
  const noDigest = structuredClone(data);
  noDigest.images.web.digest = 'sha256:unverified';
  assert.throws(() => releaseImageRefs(noDigest, registry, namespace));
});

test('Oracle2 release preview binds the exact control manifest checksum and SHA', async () => {
  const { createHash } = await import('node:crypto');
  const { oracle2ReleasePreview } = await import('../oracle2-release-preview.mjs');
  const releaseSha = 'a'.repeat(40);
  const productionSet = {
    schema: 'memoflow.production-set/v1',
    releaseTag: 'v0.21.3',
    gitSha: releaseSha,
    digest: digest('b'),
    images: Object.fromEntries(
      Object.entries(refs).map(([service, ref]) => [
        service,
        { repository: ref.split('@')[0], digest: ref.split('@')[1] },
      ]),
    ),
  };
  const manifestText = JSON.stringify(productionSet) + '\n';
  const expectedRawHash = 'sha256:' + createHash('sha256').update(manifestText).digest('hex');
  const input = {
    manifestText,
    currentCompose: compose,
    currentEnv: 'REGISTRY=example.invalid\nIMAGE_NAMESPACE=memo\nAPP_VERSION=0.21.1\n',
    expectedRawHash,
    expectedSetDigest: digest('b'),
    releaseSha,
    before: currentConfig,
    after: nextConfig(),
  };
  const plan = oracle2ReleasePreview(input);
  assert.throws(
    () =>
      oracle2ReleasePreview({
        ...input,
        currentEnv: input.currentEnv.replace('APP_VERSION=0.21.1', 'APP_VERSION=0.23.0'),
      }),
    /downgrade/u,
  );
  assert.equal(plan.releaseSha, releaseSha);
  assert.equal(plan.releaseTag, 'v0.21.3');
  assert.equal(plan.candidateEnv.split('APP_VERSION=')[1].trim(), '0.21.3');
  assert.equal(plan.candidateCompose.includes(refs.api), true);
  assert.throws(
    () => oracle2ReleasePreview({ ...input, manifestText: manifestText + ' ' }),
    /checksum mismatch/u,
  );
  assert.throws(
    () => oracle2ReleasePreview({ ...input, expectedSetDigest: digest('c') }),
    /release identity mismatch/u,
  );
  assert.throws(
    () =>
      oracle2ReleasePreview({
        ...input,
        after: { ...nextConfig(), networks: { attacker: {} } },
      }),
    /outside application images/u,
  );
});

test('published production control embeds Oracle2 read-only release preview without replacing Alibaba watcher', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../../../deployment/production/Dockerfile.runtime', import.meta.url),
    'utf8',
  );
  assert.match(source, /COPY tools\/ci-cd-platform\/oracle2-compose-candidate\.mjs/u);
  assert.match(source, /COPY tools\/ci-cd-platform\/oracle2-release-preview\.mjs/u);
  assert.match(source, /COPY deployment\/production\/production-deploy-watch\.sh/u);
});
