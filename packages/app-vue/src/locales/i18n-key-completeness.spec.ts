/**
 * CI gate: every statically extractable t()/$t()/te()/tm() key literal in
 * packages/app-vue and apps/web must resolve in both production locales.
 *
 * Failures mean users would see bare dotted keys (PM-journey P0).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import zhCN from './zh-CN';
import enUS from './en-US';

// Resolve relative to this spec file so the gate works from any cwd.
const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WORKSPACE_ROOT = resolve(PKG_ROOT, '../..');
const SCAN_ROOTS = [resolve(PKG_ROOT, 'src'), resolve(WORKSPACE_ROOT, 'apps/web/src')];
const SOURCE_EXTS = new Set(['.vue', '.ts', '.tsx']);
/** Match t('a.b'), $t("a.b.c"), te(`x.y`) with dotted keys only. */
const KEY_RE = /(?:[^\w$.]|^)(?:\$t|t|te|tm)\(\s*(['"`])((?:[\w-]+\.)+[\w-]+)\1/g;

function walkSources(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkSources(full, out);
    } else if (
      SOURCE_EXTS.has(extname(full)) &&
      !full.includes('.spec.') &&
      !full.endsWith('.test.ts') &&
      !full.endsWith('.test.tsx')
    ) {
      out.push(full);
    }
  }
  return out;
}

function extractKeys(): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  for (const root of SCAN_ROOTS) {
    for (const file of walkSources(root)) {
      const src = readFileSync(file, 'utf8');
      KEY_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = KEY_RE.exec(src))) {
        const key = match[2];
        const list = keys.get(key) ?? [];
        list.push(file);
        keys.set(key, list);
      }
    }
  }
  return keys;
}

function resolveMessage(messages: Record<string, unknown>, key: string): unknown {
  let cur: unknown = messages;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object' || !(part in (cur as object))) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function isPresent(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

describe('i18n key completeness (production locales)', () => {
  const used = extractKeys();

  it('extracts a non-trivial set of app-vue/web key literals', () => {
    expect(used.size).toBeGreaterThan(500);
  });

  it('resolves every extracted key in zh-CN and en-US production messages', () => {
    const missing: Array<{ key: string; zh: boolean; en: boolean }> = [];
    for (const key of [...used.keys()].sort()) {
      const zh = isPresent(resolveMessage(zhCN as Record<string, unknown>, key));
      const en = isPresent(resolveMessage(enUS as Record<string, unknown>, key));
      if (!zh || !en) {
        missing.push({ key, zh, en });
      }
    }
    if (missing.length > 0) {
      const sample = missing
        .slice(0, 40)
        .map((m) => `${m.key} (zh=${m.zh}, en=${m.en})`)
        .join('\n');
      expect.fail(`${missing.length} key(s) missing from production locales. Sample:\n${sample}`);
    }
  });

  it('fails the gate when a known production key is deleted (negative control)', () => {
    const probe = 'goal.list.noGoalsFound';
    expect(isPresent(resolveMessage(zhCN as Record<string, unknown>, probe))).toBe(true);
    // Simulate deletion without mutating production objects permanently
    const broken = structuredClone(zhCN) as { goal: { list: Record<string, unknown> } };
    delete broken.goal.list.noGoalsFound;
    expect(isPresent(resolveMessage(broken, probe))).toBe(false);
  });

  it('covers findings P0 keys in both locales', () => {
    const findingsKeys = [
      'goal.list.noGoalsFound',
      'goal.list.createToStart',
      'goal.list.askAi',
      'goal.list.newGoal',
      'goal.dialog.targetPrecisionHint',
      'goal.dialog.reminder',
      'goal.dialog.createGoal',
      'goal.dialog.krInitialValue',
      'goal.dialog.krCurrentValue',
      'goal.dialog.krTargetValue',
      'goal.cards.keyResultsCount',
      'goal.list.pastTarget',
      'task.templateMgmt.countLabel',
      'task.templateMgmt.emptyTitle',
      'task.templateMgmt.emptyDescription',
      'task.templateMgmt.emptyAiLink',
      'setting.title',
      'setting.groups.appearance',
      'schedule.calendar.today',
      'schedule.calendar.weekRange',
      'dashboard.goalProgress.title',
      'shell.auth.unverifiedBanner',
      'shell.auth.unverifiedAction',
      'errors.EMAIL_VERIFICATION_REQUIRED',
    ];
    for (const key of findingsKeys) {
      expect(
        isPresent(resolveMessage(zhCN as Record<string, unknown>, key)),
        `zh-CN missing ${key}`,
      ).toBe(true);
      expect(
        isPresent(resolveMessage(enUS as Record<string, unknown>, key)),
        `en-US missing ${key}`,
      ).toBe(true);
    }
  });
});
