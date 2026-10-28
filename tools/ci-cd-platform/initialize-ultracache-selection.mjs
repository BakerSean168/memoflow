#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Nx 24's standalone selector only reads snapshots. The current Cloud client
// registers commit parents in its Workers bootstrap, but not ordinary runs.
// Use that client's configure endpoint with distribution disabled; never call
// startWorkflow or write a DTE marker. Keep this adapter beside the pinned Nx API.
export function selectionContextPayload(env, head, parents) {
  const ciExecutionId =
    env.NX_CI_EXECUTION_ID ??
    env.NX_RUN_GROUP ??
    (env.GITHUB_RUN_ID ? `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}` : null);
  if (!ciExecutionId) return null;
  const ciExecutionEnv = env.NX_CI_EXECUTION_ENV ?? '';
  const branch =
    env.NX_BRANCH ??
    env.GITHUB_REF?.match(/^refs\/pull\/(\d+)\/merge$/u)?.[1] ??
    env.GITHUB_HEAD_REF ??
    env.GITHUB_REF_NAME;
  if (!branch) throw new Error('Ultracache selection requires a CI branch');
  return {
    branch,
    runGroup: env.NX_RUN_GROUP ?? `${ciExecutionId}${ciExecutionEnv ? `-${ciExecutionEnv}` : ''}`,
    ciExecutionId,
    ciExecutionEnv,
    // The service requires distribute-on even when distribution is disabled.
    // "manual" names no launch template and configure alone starts no Workers.
    ciConfiguration: 'dte:\n  enabled-by-default: false\n  distribute-on: manual\n',
    commitSha: env.NX_COMMIT_SHA ?? head,
    pipelineHeadSha: head,
    commitParentShas: parents,
  };
}

export async function initializeSelectionContext(
  nxJson,
  {
    env = process.env,
    request = fetch,
    git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim(),
  } = {},
) {
  if (
    env.CI !== 'true' ||
    env.NX_NO_CLOUD === 'true' ||
    env.NX_CLOUD_USE_ULTRACACHE === 'false' ||
    nxJson.neverConnectToCloud
  )
    return;
  if (!nxJson.nxCloudId && !env.NX_CLOUD_ACCESS_TOKEN && !env.NX_CLOUD_AUTH_TOKEN) return;
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}']);
  // cat-file reads parent headers even in a depth-2 GitHub checkout.
  const parents = git(['cat-file', '-p', head])
    .split(/\r?\n\r?\n/u, 1)[0]
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('parent '))
    .map((line) => line.slice(7));
  const payload = selectionContextPayload(env, head, parents);
  if (!payload) return;
  const headers = { 'Content-Type': 'application/json' };
  if (nxJson.nxCloudId) headers['Nx-Cloud-Id'] = nxJson.nxCloudId;
  const token = env.NX_CLOUD_AUTH_TOKEN ?? env.NX_CLOUD_ACCESS_TOKEN;
  if (token) headers.authorization = token;
  const base = env.NX_CLOUD_API ?? nxJson.nxCloudUrl ?? 'https://cloud.nx.app';
  const response = await request(new URL('/nx-cloud/run-groups/v1/configure', base), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Nx Cloud selection context returned HTTP ${response.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await initializeSelectionContext(JSON.parse(await readFile('nx.json', 'utf8')));
}
