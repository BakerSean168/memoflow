import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { curatedIndexDigest, curatedLinuxIndex, writeCuratedLayout } from '../curate-oci-index.mjs';

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

test('OCI layout publishes exact index bytes and rejects a corrupt copied child', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'memoflow-oci-test-'));
  try {
    const blobDirectory = path.join(directory, 'blobs', 'sha256');
    await mkdir(blobDirectory, { recursive: true });
    const manifests = [];
    for (const arch of ['arm64', 'amd64']) {
      const bytes = JSON.stringify({ schemaVersion: 2, architecture: arch });
      const hash = createHash('sha256').update(bytes).digest('hex');
      await writeFile(path.join(blobDirectory, hash), bytes);
      manifests.push(make(arch, `sha256:${hash}`, Buffer.byteLength(bytes)));
    }
    const input = { ...upstream, manifests: [...manifests, upstream.manifests[2]] };
    const digest = await writeCuratedLayout(input, directory);
    const root = JSON.parse(await readFile(path.join(directory, 'index.json'), 'utf8'));
    assert.equal(root.manifests[0].digest, digest);
    const bytes = await readFile(path.join(blobDirectory, digest.slice(7)));
    assert.equal(`sha256:${createHash('sha256').update(bytes).digest('hex')}`, digest);
    assert.equal(root.manifests[0].size, bytes.length);
    assert.deepEqual(JSON.parse(bytes), curatedLinuxIndex(input));
    assert.equal(JSON.parse(bytes).manifests.length, 2);
    await writeFile(path.join(blobDirectory, manifests[0].digest.slice(7)), 'corrupt');
    await assert.rejects(writeCuratedLayout(input, directory), /pinned descriptor/u);
    // A rejected conversion must leave the last valid root intact.
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'index.json'), 'utf8')), root);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
