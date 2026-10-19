import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { digest } from './contracts.mjs';
import { isCiInput, requireProof } from './ci-evidence.mjs';

const exec = promisify(execFile);
export function verifyArchiveDigest(bytes, expected) {
  requireProof(
    /^sha256:[a-f0-9]{64}$/u.test(expected) &&
      `sha256:${createHash('sha256').update(bytes).digest('hex')}` === expected,
    'artifact archive digest mismatch',
  );
}

export async function git(args) {
  const { stdout } = await exec('git', args, { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}
export async function gitCommit(sha) {
  requireProof(/^[a-f0-9]{40}$/u.test(sha), 'invalid Git SHA');
  try {
    await git(['cat-file', '-e', `${sha}^{commit}`]);
  } catch {
    await git(['fetch', '--no-tags', 'origin', sha]);
  }
  const [resolved, tree, ...parents] = (await git(['show', '-s', '--format=%H %T %P', sha]))
    .trim()
    .split(' ');
  // Explicitly recompute the tree from the object, rather than trusting evidence JSON.
  requireProof((await git(['rev-parse', `${sha}^{tree}`])).trim() === tree, 'local tree mismatch');
  return {
    sha: resolved,
    tree: { sha: tree },
    parents: parents.map((parent) => ({ sha: parent })),
  };
}
export async function changedFiles(base, head) {
  return (await git(['diff', '--name-only', '-z', base, head])).split('\0').filter(Boolean).sort();
}
export async function inputsDigest(sha) {
  const entries = (await git(['ls-tree', '-r', '-z', sha])).split('\0').filter(Boolean);
  return digest(entries.filter((entry) => isCiInput(entry.slice(entry.indexOf('\t') + 1))).sort());
}

export function githubEvidenceClient({
  repository = process.env.GITHUB_REPOSITORY,
  token = process.env.GITHUB_TOKEN,
  fetchImplementation = fetch,
} = {}) {
  requireProof(
    /^[\w.-]+\/[\w.-]+$/u.test(repository) && Boolean(token),
    'repository and GitHub token required',
  );
  const root = `/repos/${repository}`;
  async function request(route, binary = false) {
    requireProof(route.startsWith(`${root}/`), 'API route outside repository');
    const response = await fetchImplementation(`https://api.github.com${route}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(30_000),
    });
    requireProof(response.ok, `GitHub API ${response.status} for ${route}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      requireProof(size <= 8 * 1024 * 1024, 'evidence API response exceeds limit');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    return binary ? bytes : JSON.parse(bytes.toString('utf8'));
  }
  async function artifact(run, name) {
    const response = await request(`${root}/actions/runs/${run.id}/artifacts?per_page=100`);
    requireProof(
      Number.isSafeInteger(response.total_count) &&
        Array.isArray(response.artifacts) &&
        response.total_count === response.artifacts.length,
      'incomplete artifacts API response',
    );
    const matches = response.artifacts.filter((entry) => entry.name === name);
    requireProof(matches.length === 1, `missing/ambiguous ${name}`);
    const value = matches[0];
    requireProof(
      Number.isSafeInteger(value.id) &&
        value.expired === false &&
        /^sha256:[a-f0-9]{64}$/u.test(value.digest) &&
        value.workflow_run?.id === run.id &&
        value.workflow_run.head_sha === run.head_sha,
      'artifact identity/digest mismatch',
    );
    return value;
  }
  async function readArtifactJson(run, name, file) {
    requireProof(/^[\w.-]+$/u.test(file), 'invalid artifact JSON filename');
    const value = await artifact(run, name);
    const bytes = await request(`${root}/actions/artifacts/${value.id}/zip`, true);
    verifyArchiveDigest(bytes, value.digest);
    const temporary = await mkdtemp(path.join(tmpdir(), 'ci-evidence-'));
    try {
      const archive = path.join(temporary, 'evidence.zip');
      await writeFile(archive, bytes);
      const { stdout } = await exec('unzip', ['-p', archive, file], {
        timeout: 10_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  return {
    api: request,
    artifact,
    readArtifactJson,
    readEvidence: (run) => readArtifactJson(run, 'ci-evidence-v1', 'ci-evidence-v1.json'),
    repository,
    gitCommit,
    changedFiles,
    inputsDigest,
  };
}
