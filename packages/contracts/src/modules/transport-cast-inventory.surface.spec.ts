/**
 * Production transport cast inventory surface (Phase 4, Step 5).
 *
 * After Phase 4, production transport DTO / application-boundary /
 * Prisma-row-to-contract conversions must use named mappers — NOT
 * `as unknown as` casts. Test fixtures (`*.spec.ts` / `*.test.ts` /
 * `testing/`) are excluded. This spec audits the FULL production `src` roots of
 * goal/task/notification (transport, domain-client, server infrastructure,
 * runtime, outbox — any file that could gain a cross-boundary cast) and fails
 * if any NEW `as unknown as` cast appears outside the explicit allowlist. The
 * allowlist enumerates every remaining production cast with a path + reason
 * (low-level native/transaction/runtime/SSE/domain-client branded-id
 * boundaries that cannot be expressed from contract types without a broad
 * `Record` fallback).
 *
 * Phase 4 后，生产 transport DTO / application 边界 / Prisma-row 转换必须使用
 * 命名 mapper，而不是 `as unknown as` 强转。test fixture（`*.spec.ts` /
 * `*.test.ts` / `testing/`）不在审计范围。本 spec 审计 goal/task/notification
 * 的完整生产 `src` 根（transport、domain-client、server infrastructure、
 * runtime、outbox——任何可能出现跨边界强转的文件），并在显式 allowlist 之外
 * 出现任何新的 `as unknown as` 强转时失败。allowlist 枚举所有剩余生产强转，
 * 每条带路径 + 原因（低层 native/transaction/runtime/SSE/domain-client
 * branded-id 边界，无法从 contract 类型表达而不退化为宽泛 `Record`）。
 */
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../../');

/**
 * Production roots audited for cross-boundary DTO casts. Covers the complete
 * production `src` tree of goal/task/notification so a new cast anywhere in a
 * production file (transport, application, infrastructure, runtime, outbox,
 * domain-client) fails the inventory unless allowlisted.
 *
 * 审计的生产根：覆盖 goal/task/notification 的完整生产 `src` 树，使生产文件中
 * 任意位置（transport、application、infrastructure、runtime、outbox、
 * domain-client）新增强转都会使 inventory 失败，除非已加入 allowlist。
 */
const AUDITED_PATHS = [
  'packages/goal/src',
  'packages/task/src',
  'packages/notification/src',
] as const;

/**
 * Production cast allowlist (file → reason). Each entry is a low-level native /
 * transaction / runtime / SSE / domain-client branded-id structural cast that
 * cannot be expressed from contract types without a broad Record fallback.
 * Keeping the reason inline keeps the audit self-documenting.
 *
 * 生产 cast allowlist（file → 原因）。每条都是低层 native/transaction/runtime/
 * SSE/domain-client branded-id 结构强转，无法从 contract 类型表达而不退化为
 * 宽泛 Record。原因内联，使审计自文档化。
 */
const ALLOWLIST: Record<string, string> = {
  // Goal: low-level transaction runner native handle (Prisma transaction client).
  'packages/goal/src/server/infrastructure/adapters/prisma/prisma-goal-write-transaction-runner.ts':
    'native Prisma transaction client cast (allowlist)',
  // Goal: domain aggregate writes a branded-id snapshot (domain-client
  // branded-id boundary; cannot express from contract types).
  'packages/goal/src/server/domain/aggregates/goal.ts':
    'domain-client branded-id snapshot boundary (allowlist)',
  // Task: outbox event versioned cast (reliable-messaging version boundary).
  'packages/task/src/server/application/outbox/task-goal-outbox-dispatcher.ts':
    'outbox event version boundary (allowlist)',
  // Notification: low-level reliable-operation adapter mutates native Prisma
  // return `applied` flag on the wire.
  'packages/notification/src/server/infrastructure/adapters/prisma/notification-reliable-operation-prisma.adapter.ts':
    'native Prisma return mutation (allowlist)',
  // Notification: low-level reliable-operation adapter mutates native
  // PowerSync return `applied` flag on the wire.
  'packages/notification/src/server/infrastructure/adapters/powersync/power-sync-notification-reliable.adapter.ts':
    'native PowerSync return mutation (allowlist)',
  // Notification: native desktop transport / PowerSync runtime handle casts.
  'packages/notification/src/server/infrastructure/powersync.ts':
    'native desktop/PowerSync handle casts (allowlist)',
  // Notification: runtime structural probes (capability duck-typing, ack
  // handles, reliable-adapter fallback seam).
  'packages/notification/src/server/infrastructure/runtime/notification.runtime.ts':
    'runtime structural probe casts (allowlist)',
  // Notification: native deliverer adapter duck-types notification/channel
  // objects to pick server DTOs and targets.
  'packages/notification/src/server/infrastructure/adapters/deliverers/real-channel-deliverers.ts':
    'native deliverer duck-typing casts (allowlist)',
  // Notification: domain-client branded-id boundaries on server DTO projection.
  'packages/notification/src/domain-client/aggregates/notification.ts':
    'domain-client branded-id boundary (allowlist)',
  'packages/notification/src/domain-client/aggregates/notification-preference.ts':
    'domain-client branded-id boundary (allowlist)',
  // Notification SSE: stream adapter flush + event id structural probing.
  'packages/notification/src/api/routes.ts': 'SSE stream adapter structural casts (allowlist)',
};

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = resolve(current, entry.name);
      if (entry.isDirectory()) {
        // Skip generated/testing/asset trees that are not production source.
        if (entry.name === 'testing' || entry.name === 'generated') continue;
        walk(full);
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.spec.ts') &&
        !entry.name.endsWith('.test.ts')
      ) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

describe('production transport cast inventory (Phase 4 Step 5)', () => {
  it('no unallowlisted `as unknown as` casts appear in production roots', () => {
    const violations: string[] = [];

    for (const rel of AUDITED_PATHS) {
      const abs = resolve(ROOT, rel);
      for (const file of listSourceFiles(abs)) {
        const relPath = file.replace(`${ROOT}/`, '');
        if (ALLOWLIST[relPath]) continue;
        const src = readFileSync(file, 'utf8');
        // Strip block and line comments across the WHOLE file first, so
        // multi-line JSDoc mentioning the cast pattern does not false-positive.
        const code = src
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .split('\n')
          .map((line) => line.replace(/\/\/.*$/, ''))
          .join('\n');
        code.split('\n').forEach((line, idx) => {
          if (line.includes('as unknown as')) {
            violations.push(`${relPath}:${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }

    expect(violations).toEqual([]);
  });

  it('every allowlist entry still contains at least one production cast (no stale entries)', () => {
    for (const [relPath, reason] of Object.entries(ALLOWLIST)) {
      const file = resolve(ROOT, relPath);
      const src = readFileSync(file, 'utf8');
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
      const hasCast = code.includes('as unknown as');
      expect(hasCast, `${relPath} (${reason}) must still contain a production cast`).toBe(true);
    }
  });
});
