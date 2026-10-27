/**
 * Governance gate (moved from packages/app-vue/src/locales, #488): every statically extractable t()/$t()/te()/tm() key literal in
 * packages/app-vue and apps/web must resolve in both production locales.
 *
 * Failures mean users would see bare dotted keys (PM-journey P0).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolve relative to this file so the gate works from any cwd.
const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PKG_ROOT = resolve(WORKSPACE_ROOT, 'packages/app-vue');
// Locale catalogs are data owned by app-vue; load them by path (the gate reads them, it does not
// depend on the app-vue project graph).
const LOCALES_ROOT = resolve(PKG_ROOT, 'src/locales');
const { default: zhCN } = await import(resolve(LOCALES_ROOT, 'zh-CN/index.ts'));
const { default: enUS } = await import(resolve(LOCALES_ROOT, 'en-US/index.ts'));
const SCAN_ROOTS = [
  resolve(PKG_ROOT, 'src'),
  resolve(WORKSPACE_ROOT, 'apps/web/src'),
  // Extracted UI packages keep their surface keys in their own sources (#630 §4.9).
  resolve(WORKSPACE_ROOT, 'packages/setting-ui/src'),
  resolve(WORKSPACE_ROOT, 'packages/account-ui/src'),
];
const SOURCE_EXTS = new Set(['.vue', '.ts', '.tsx']);
/** Match t('a.b'), $t("a.b.c"), te(`x.y`) with dotted keys only. */
const KEY_RE = /(?:[^\w$.]|^)(?:\$t|t|te|tm)\(\s*(['"`])((?:[\w-]+\.)+[\w-]+)\1/g;

function walkSources(dir, out = []) {
  let entries;
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

function extractKeys() {
  const keys = new Map();
  for (const root of SCAN_ROOTS) {
    for (const file of walkSources(root)) {
      const src = readFileSync(file, 'utf8');
      KEY_RE.lastIndex = 0;
      let match;
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

function resolveMessage(messages, key) {
  let cur = messages;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object' || !(part in cur)) {
      return undefined;
    }
    cur = cur[part];
  }
  return cur;
}

function isPresent(value) {
  return typeof value === 'string' && value.length > 0;
}

describe('i18n key completeness (production locales)', () => {
  const used = extractKeys();

  it('extracts a non-trivial set of app-vue/web key literals', () => {
    expect(used.size).toBeGreaterThan(500);
  });

  it('resolves every extracted key in zh-CN and en-US production messages', () => {
    const missing = [];
    for (const key of [...used.keys()].sort()) {
      const zh = isPresent(resolveMessage(zhCN, key));
      const en = isPresent(resolveMessage(enUS, key));
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
    expect(isPresent(resolveMessage(zhCN, probe))).toBe(true);
    // Simulate deletion without mutating production objects permanently
    const broken = structuredClone(zhCN);
    delete broken.goal.list.noGoalsFound;
    expect(isPresent(resolveMessage(broken, probe))).toBe(false);
  });

  it('keeps the zh-CN Routine surface translated instead of leaking the English product noun', () => {
    expect(zhCN.nav.routines).toBe('例程');
    expect(zhCN.nav.capsule.routine).toBe('例程');
    expect(zhCN.routine.home.title).toBe('今日例程');
    expect(JSON.stringify(zhCN.routine)).not.toContain('Routine');
  });

  it('covers findings P0 keys in both locales', () => {
    const findingsKeys = [
      'goal.list.noGoalsFound',
      'goal.list.createToStart',
      'goal.list.askAi',
      'goal.list.newGoal',
      'goal.dialog.timeframeInputPlaceholder',
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
      'goal.homeProgress.title',
      'shell.auth.unverifiedBanner',
      'shell.auth.unverifiedAction',
      'errors.EMAIL_VERIFICATION_REQUIRED',
    ];
    for (const key of findingsKeys) {
      expect(isPresent(resolveMessage(zhCN, key)), `zh-CN missing ${key}`).toBe(true);
      expect(isPresent(resolveMessage(enUS, key)), `en-US missing ${key}`).toBe(true);
    }
  });
});
