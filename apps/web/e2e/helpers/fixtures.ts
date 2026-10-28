import { randomUUID } from 'node:crypto';
import type { BrowserContext, Response, TestInfo } from '@playwright/test';
import { test as base } from '@playwright/test';
import { isAuthenticated, provisionWorkerIdentity, refreshWorkerSession } from './worker-auth';
import type { WorkerIdentity } from './worker-auth';

/**
 * Shared Web E2E fixtures: one authenticated identity per Playwright worker and
 * one isolated BrowserContext + data namespace per test.
 *
 * Contract:
 * - Worker identity: created once per worker via the API helpers; its
 *   storageState is reused but never mutated by business assertions.
 * - Test context: `storageState` is overridden, so every test still gets a
 *   fresh BrowserContext instance from Playwright (cookies, storage, cache and
 *   ports never leak across tests).
 * - Data namespace: every test owns a random owner key; seeded records embed
 *   the key in their names and are deleted in fixture teardown, including when
 *   the test fails mid-way. Tests must not rely on execution order.
 * - Session recovery: an invalid session is repaired through the API once per
 *   test (state file rewritten) and 401 responses start the same single repair.
 *
 * Authentication-domain specs (apps/web/e2e/authentication/**, cross-owner
 * isolation, sign-out/PIN and password flows) must NOT use this fixture: they
 * verify the real auth surface or multiple identities.
 */

export type SeededGoal = { id: string; version: number };
export type SeededTaskPlan = { id: string };

export type TestDataNamespace = {
  /** Random key unique to this test; also embedded in every seeded record name. */
  readonly key: string;
  /** Namespaced display name for a business record. */
  name(label: string): string;
  seedGoal(input?: { name?: string; summary?: string }): Promise<SeededGoal>;
  seedTaskPlan(input?: { name?: string }): Promise<SeededTaskPlan>;
  /** Read back a goal through the owner API (soft-deleted rows report `deletedAt`). */
  readGoal(goalId: string): Promise<{ name?: string; deletedAt?: unknown } | null>;
  /** Restore the shared worker account's presentation/regional preferences to defaults. */
  resetPreferences(): Promise<void>;
  /** Clear the shared worker account's editable profile fields (fresh-account baseline). */
  resetAccountProfile(): Promise<void>;
  /** Register an extra idempotent cleanup step; runs in reverse registration order. */
  onCleanup(label: string, run: () => Promise<void>): void;
  /** Run pending cleanups immediately (tests may assert cleanup explicitly). */
  cleanupNow(): Promise<void>;
  readonly cleanupCount: number;
  readonly cleanupFailures: string[];
};

export type AuthSession = {
  readonly identity: WorkerIdentity;
  /** Probe the server session; returns 'valid' or 'refreshed' after one API re-login. */
  ensureValid(): Promise<'valid' | 'refreshed'>;
  /** Whether the worker identity currently holds a live server session. */
  hasServerSession(): Promise<boolean>;
  /** Drop the browser cookies without touching the account on the server. */
  expire(): Promise<void>;
  /** Number of API re-logins performed for this test (0 or 1). */
  readonly refreshCount: number;
  readonly expiredResponses: number;
};

type WorkerFixtures = {
  workerAccount: WorkerIdentity;
};

type TestFixtures = {
  authSession: AuthSession;
  testData: TestDataNamespace;
};

const API_TASK_PLAN_DATE = '2030-01-02';

async function apiJson<T>(
  context: BrowserContext,
  path: string,
  options: { method?: 'GET' | 'POST' | 'DELETE'; data?: unknown } = {},
): Promise<T> {
  const response = await context.request.fetch(path, {
    method: options.method ?? 'GET',
    data: options.data,
    failOnStatusCode: false,
  });
  if (!response.ok()) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed with HTTP ${response.status()}: ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { data?: T };
  return (body.data ?? body) as T;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  workerAccount: [
    async ({ playwright }, use, workerInfo) => {
      const identity = await provisionWorkerIdentity(playwright, workerInfo.workerIndex);
      await use(identity);
    },
    { scope: 'worker', timeout: 3 * 60_000 },
  ],

  /**
   * Override the built-in storageState option so Playwright's own `context`
   * fixture keeps ownership of context creation, tracing and screenshots while
   * every test starts from this worker's authenticated state.
   */
  storageState: async ({ workerAccount }, use) => {
    await use(workerAccount.statePath);
  },

  authSession: async ({ context, workerAccount }, use) => {
    let refreshCount = 0;
    let expiredResponses = 0;
    let repair: Promise<void> | null = null;

    const repairOnce = async (): Promise<boolean> => {
      if (refreshCount >= 1) return false;
      refreshCount += 1;
      await refreshWorkerSession(context.request, workerAccount);
      return true;
    };

    const ensureValid = async (): Promise<'valid' | 'refreshed'> => {
      // Concurrent 401s share one repair instead of racing extra sign-ins.
      if (repair) {
        await repair;
        return 'refreshed';
      }
      if (await isAuthenticated(context.request)) return 'valid';

      repair = (async () => {
        if (!(await repairOnce())) {
          throw new Error(
            'E2E session stayed unauthenticated after the single allowed API re-login',
          );
        }
      })();
      try {
        await repair;
      } finally {
        repair = null;
      }
      return 'refreshed';
    };

    const onResponse = (response: Response) => {
      if (response.status() !== 401) return;
      const { pathname } = new URL(response.url());
      if (!pathname.startsWith('/api/') || pathname.startsWith('/api/auth/')) return;
      expiredResponses += 1;
      // Repair is best-effort: the failing request already returned, but the
      // refreshed cookies keep the rest of the test and the next test valid.
      void ensureValid().catch((error) => {
        console.error('[e2e-auth] session repair after 401 failed:', error);
      });
    };

    context.on('response', onResponse);
    try {
      // A stale state file (or a previous test that expired cookies) must not
      // decide the outcome of this test, so validate before the body runs.
      await ensureValid();
      await use({
        identity: workerAccount,
        ensureValid,
        hasServerSession: () => isAuthenticated(context.request),
        expire: async () => {
          await context.clearCookies();
        },
        get refreshCount() {
          return refreshCount;
        },
        get expiredResponses() {
          return expiredResponses;
        },
      });
    } finally {
      context.off('response', onResponse);
    }
  },

  testData: async ({ context }, use, testInfo: TestInfo) => {
    const key = `e2e-${randomUUID().slice(0, 8)}`;
    const cleanups: Array<{ label: string; run: () => Promise<void> }> = [];
    const cleanupFailures: string[] = [];
    let cleanupCount = 0;

    const namespace: TestDataNamespace = {
      key,
      name: (label: string) => `${label} [${key}]`,
      async seedGoal(input = {}) {
        const receipt = await apiJson<{ goalId: string; goalVersion: number }>(context, '/api/v1/goals', {
          method: 'POST',
          data: {
            name: namespace.name(input.name ?? 'Goal'),
            summary: input.summary ?? `Seeded by ${key}`,
          },
        });
        namespace.onCleanup(`goal:${receipt.goalId}`, async () => {
          await context.request.delete(
            `/api/v1/goals/${receipt.goalId}?expectedVersion=${receipt.goalVersion}`,
            { failOnStatusCode: false },
          );
        });
        return { id: receipt.goalId, version: receipt.goalVersion };
      },
      async seedTaskPlan(input = {}) {
        const created = await apiJson<{ plan?: { id: string }; id?: string }>(
          context,
          '/api/v1/task-plans',
          {
            method: 'POST',
            data: {
              name: namespace.name(input.name ?? 'Task'),
              importance: 'Moderate',
              schedule: {
                kind: 'OneTime',
                date: API_TASK_PLAN_DATE,
                timing: { kind: 'AllDay' },
              },
            },
          },
        );
        const id = created.plan?.id ?? created.id;
        if (!id) throw new Error(`Task plan creation returned no id: ${JSON.stringify(created)}`);
        namespace.onCleanup(`task:${id}`, async () => {
          await context.request.delete(`/api/v1/task-plans/${id}`, { failOnStatusCode: false });
        });
        return { id };
      },
      onCleanup(label, run) {
        cleanups.push({ label, run });
      },
      async readGoal(goalId: string) {
        const response = await context.request.get(`/api/v1/goals/${goalId}`, {
          failOnStatusCode: false,
        });
        if (!response.ok()) return null;
        const body = (await response.json()) as {
          data?: { name?: string; deletedAt?: unknown };
        };
        return body.data ?? null;
      },
      async resetPreferences() {
        // Account-level preference rows survive the test, so a shared worker
        // identity must be restored to the defaults a new account has.
        const response = await context.request.post(
          '/api/v1/settings/preferences/reset-all',
          { data: {}, failOnStatusCode: false },
        );
        if (!response.ok()) {
          throw new Error(
            `Preference reset failed with HTTP ${response.status()}: ${await response.text()}`,
          );
        }
      },
      async resetAccountProfile() {
        const response = await context.request.put('/api/v1/accounts/me', {
          data: { avatar: null, bio: null },
          failOnStatusCode: false,
        });
        if (!response.ok()) {
          throw new Error(
            `Account profile reset failed with HTTP ${response.status()}: ${await response.text()}`,
          );
        }
      },
      async cleanupNow() {
        const pending = cleanups.splice(0).reverse();
        for (const entry of pending) {
          cleanupCount += 1;
          try {
            await entry.run();
          } catch (error) {
            cleanupFailures.push(`${entry.label}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      },
      get cleanupCount() {
        return cleanupCount;
      },
      get cleanupFailures() {
        return cleanupFailures;
      },
    } as TestDataNamespace;

    await use(namespace);

    // Teardown runs on pass and on failure; a broken cleanup must not silently
    // pass, so it is attached to the report and logged.
    await namespace.cleanupNow();
    if (cleanupFailures.length > 0) {
      await testInfo.attach('e2e-cleanup-failures.json', {
        body: JSON.stringify({ key, failures: cleanupFailures }, null, 2),
        contentType: 'application/json',
      });
      console.warn(`[e2e-data] cleanup failures for ${key}: ${cleanupFailures.join('; ')}`);
    }
    if (cleanupCount > 0) {
      console.log(`[e2e-data] namespace ${key}: ${cleanupCount} cleanup step(s), ${cleanupFailures.length} failure(s)`);
    }
  },
});

export { expect } from '@playwright/test';
