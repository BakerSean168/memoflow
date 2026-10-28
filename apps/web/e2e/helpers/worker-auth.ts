import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { APIRequestContext, Playwright } from '@playwright/test';
import { TIMEOUT_CONFIG, TEST_USERS, WEB_CONFIG } from '../config';
import {
  createSelfRegisterEmail,
  registerAccountViaApiRequest,
  signInViaApiRequest,
} from './auth-api';

/**
 * Worker-scoped authenticated session preparation for ordinary logged-in Web E2E.
 *
 * One Better Auth account is created through the API (sign-up + captured email
 * verification + sign-in) for every Playwright worker, and its storageState is
 * written to a runner-local temp directory outside the repository. Tests share
 * that identity only for authentication; mutable business data is namespaced per
 * test by `fixtures.ts` so one test can never observe another test's records.
 *
 * Location invariants:
 * - outside the worktree, so `git status` can never see it and CI artifact
 *   uploads of `apps/web/test-results` cannot leak it;
 * - the file also carries the throwaway account credentials so a worker can
 *   re-sign-in after its session expires, so it must stay private to the runner.
 */

const DEFAULT_AUTH_STATE_ROOT = path.join(os.tmpdir(), 'memoflow-e2e-auth');

export const AUTH_STATE_DIR = process.env.E2E_AUTH_STATE_DIR?.trim()
  ? path.resolve(process.env.E2E_AUTH_STATE_DIR)
  : DEFAULT_AUTH_STATE_ROOT;

/**
 * State is scoped by the Playwright runner process (workers share the parent
 * pid), so two concurrent local runs cannot overwrite each other's files while
 * a rerun still reuses the same directory layout.
 */
export const AUTH_RUN_DIR = path.join(AUTH_STATE_DIR, `run-${process.ppid}`);

export type WorkerIdentity = {
  workerIndex: number;
  email: string;
  password: string;
  statePath: string;
};

export function workerStatePath(workerIndex: number): string {
  return path.join(AUTH_RUN_DIR, `worker-${workerIndex}.json`);
}

/** Persist the current cookie jar so per-test BrowserContexts can start from it. */
export async function persistStorageState(
  source: Pick<APIRequestContext, 'storageState'>,
  statePath: string,
): Promise<void> {
  const state = await source.storageState();
  mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

export async function isAuthenticated(request: APIRequestContext): Promise<boolean> {
  const response = await request.get(`${WEB_CONFIG.BASE_URL}/api/auth/get-session`, {
    failOnStatusCode: false,
    timeout: TIMEOUT_CONFIG.API_REQUEST,
  });
  if (!response.ok()) return false;
  const body = (await response.json().catch(() => null)) as
    | { session?: unknown; user?: unknown }
    | null;
  return Boolean(body?.session ?? body?.user);
}

/**
 * Sign the worker identity back in through the Web origin (so the cookie stays
 * scoped to the surface the browser uses) and rewrite the worker state file.
 */
export async function refreshWorkerSession(
  request: APIRequestContext,
  identity: Pick<WorkerIdentity, 'email' | 'password' | 'statePath'>,
): Promise<void> {
  await signInViaApiRequest(request, { email: identity.email, password: identity.password });
  await persistStorageState(request, identity.statePath);
}

export async function provisionWorkerIdentity(
  playwright: Playwright,
  workerIndex: number,
): Promise<WorkerIdentity> {
  const statePath = workerStatePath(workerIndex);
  rmSync(statePath, { force: true });

  const email = createSelfRegisterEmail(`e2e-worker-${workerIndex}`);
  const password = TEST_USERS.MAIN.password;

  // `baseURL` is the Web origin: the Better Auth session cookie must be scoped
  // to the origin the browser actually visits, not to the API host.
  const request = await playwright.request.newContext({
    baseURL: WEB_CONFIG.BASE_URL,
    timeout: TIMEOUT_CONFIG.AUTH_MUTATION,
  });
  try {
    await registerAccountViaApiRequest(request, { email, password });
    await persistStorageState(request, statePath);
  } finally {
    await request.dispose();
  }

  return { workerIndex, email, password, statePath };
}
