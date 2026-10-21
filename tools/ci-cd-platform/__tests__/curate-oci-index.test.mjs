import assert from 'node:assert/strict';
import test from 'node:test';
import { curatedIndexDigest, curatedLinuxIndex } from '../curate-oci-index.mjs';

const dig = (v) => 'sha256:' + v.repeat(64);
const make = (arch, digest, size = 2898) => ({
  mediaType: 'application/vnd.oci.image.manifest.v1+json',
  digest,
  size,
  platform: { architecture: arch, os: arch === 'unknown' ? 'unknown' : 'linux' },
});
const upstream = {
  schemaVersion: 2,
  mediaType: 'application/vnd.oci.image.index.v1+json',
  manifests: [
    make('arm64', 'sha256:2458d49e27a280410aec44c6d3422c9dcba1a1a39ffca2120ddff20def763b11'),
    make('amd64', 'sha256:58003bcf4897a36bec948a10d2f37753a1188270330d43757caa2aa8dfe2d0b8'),
    {
      ...make('unknown', dig('a'), 1112),
      annotations: { 'vnd.docker.reference.type': 'attestation-manifest' },
    },
    {
      ...make('unknown', dig('b'), 1112),
      annotations: { 'vnd.docker.reference.type': 'attestation-manifest' },
    },
  ],
};

test('PowerSync curated digest is deterministic and excludes only attached attestations', () => {
  const curated = curatedLinuxIndex(upstream);
  assert.deepEqual(
    curated.manifests.map((entry) => entry.platform.architecture),
    ['amd64', 'arm64'],
  );
  assert.equal(curated.manifests.length, 2);
  assert.equal(
    curatedIndexDigest(upstream),
    'sha256:43465dad45e663cbf968494c0eaded002d4ad7ac1af9359dee6df06c8821715a',
  );
  assert.equal(
    curatedIndexDigest({
      ...upstream,
      manifests: [...upstream.manifests].reverse(),
    }),
    curatedIndexDigest(upstream),
  );
});

test('OCI curating never substitutes or duplicates an executable platform', () => {
  assert.throws(
    () =>
      curatedIndexDigest({
        ...upstream,
        manifests: upstream.manifests.filter((m) => m.platform.architecture !== 'arm64'),
      }),
    /linux\/arm64/u,
  );
  assert.throws(
    () =>
      curatedIndexDigest({
        ...upstream,
        manifests: [...upstream.manifests, upstream.manifests[0]],
      }),
    /exactly one linux\/arm64/u,
  );
});
