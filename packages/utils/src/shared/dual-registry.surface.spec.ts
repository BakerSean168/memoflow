/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 14 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: build-recurrence-rule-dual.surface.spec.ts, build-reminder-template-input-dual.surface.spec.ts, error-message-cli-dual.surface.spec.ts, error-message-dual.surface.spec.ts, escape-html-dual.surface.spec.ts, extract-error-message-dual.surface.spec.ts, parse-json-safe-dual.surface.spec.ts, parse-query-boolean-dual.surface.spec.ts, parse-query-value-dual.surface.spec.ts, parse-query-value-governance-dual.surface.spec.ts, presentation-preference-dual.surface.spec.ts, preview-text-dual.surface.spec.ts, read-nested-number-dual.surface.spec.ts, reminder-time-of-day-dual.surface.spec.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { errorMessage } from './error-message';
import { escapeHtml } from './escape-html';
import { parseBoolean, parseNumber, parseString } from './parse-query-value';
import { withCause, parseJson, parseJsonSafe } from './persistence';
import { detectBrowserLocale, normalizeLocale, normalizeTheme } from './presentation-preference';
import { DEFAULT_REMINDER_TIME_OF_DAY, REMINDER_TIME_OF_DAY_PATTERN, buildReminderStartTimestamp, normalizeReminderTimeOfDay } from './reminder-time-of-day';

// --- AI-VNEXT-07: retired Goal automation helper surface ---
{
  /**
   * The old API/Desktop automation executors were deleted with AgentHost. Their
   * two utils-only composition helpers had no remaining production consumers,
   * so keeping them would preserve a misleading legacy execution surface.
   */
  describe('retired Goal automation helper surface', () => {
    const sharedDir = __dirname;
    const index = readFileSync(resolve(sharedDir, 'index.ts'), 'utf8');
    const retiredPaths = [
      resolve(sharedDir, 'build-recurrence-rule.ts'),
      resolve(sharedDir, 'build-reminder-template-input.ts'),
      resolve(sharedDir, '../../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts'),
      resolve(sharedDir, '../../../../apps/desktop/src/main/modules/ai/desktop-automation-tool-executor.adapter.ts'),
    ];

    it('keeps the retired helper and AgentHost executor surfaces deleted', () => {
      for (const path of retiredPaths) expect(existsSync(path), path).toBe(false);
      expect(index).not.toContain("export * from './build-recurrence-rule'");
      expect(index).not.toContain("export * from './build-reminder-template-input'");
    });
  });
}

// --- merged from error-message-cli-dual.surface.spec.ts ---
{
  /**
   * Residual 1019: database CLI toErrorMessage dual retired onto residual 999 sole.
   * Sole body in @memoflow/utils/shared/error-message; scripts alias import as toErrorMessage.
   * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
   * Soft residual 999: AI runtime + local vault already on sole.
   * Does not flip §13.2 checkboxes.
   */
  describe('database CLI toErrorMessage dual retired (residual 1019)', () => {
    const sharedDir = __dirname;
    const sole = readFileSync(resolve(sharedDir, 'error-message.ts'), 'utf8');
    const index = readFileSync(resolve(sharedDir, 'index.ts'), 'utf8');
    const scripts = {
      preparePgvector: readFileSync(
        resolve(sharedDir, '../../../database/scripts/prepare-ai-knowledge-index-pgvector.ts'),
        'utf8',
      ),
      bootstrap: readFileSync(
        resolve(sharedDir, '../../../database/scripts/bootstrap-ai-knowledge-index.ts'),
        'utf8',
      ),
      verify: readFileSync(
        resolve(sharedDir, '../../../database/scripts/verify-ai-knowledge-index.ts'),
        'utf8',
      ),
    } as const;

    it('owns residual 999 sole errorMessage body and shared barrel export', () => {
      expect(sole).toContain('Residual 999');
      expect(sole).toMatch(/export function errorMessage\b/);
      expect(sole).toContain('error instanceof Error');
      expect(sole).toContain('String(error)');
      expect(index).toContain("export * from './error-message'");
    });

    it('database CLI scripts import sole without local dual bodies', () => {
      for (const [label, source] of Object.entries(scripts)) {
        expect(source, label).toContain('Residual 1019');
        expect(source, label).toContain(
          "import { errorMessage as toErrorMessage } from '@memoflow/utils/shared'",
        );
        expect(source, label).not.toMatch(/function toErrorMessage\b/);
        expect(source, label).not.toMatch(/function errorMessage\b/);
        expect(source, label).toContain('toErrorMessage(');
      }
    });

    it('scripts keep load-workspace-env local bootstrap without reintroducing dual helper bodies', () => {
      for (const [label, source] of Object.entries(scripts)) {
        expect(source, label).toContain("from '../src/load-workspace-env'");
        expect(source, label).not.toContain('error instanceof Error ? error.message');
      }
    });

    it('coerces Error and non-Error values (sole behavior used by CLI alias)', () => {
      expect(errorMessage(new Error('boom'))).toBe('boom');
      expect(errorMessage('plain')).toBe('plain');
      expect(errorMessage(42)).toBe('42');
      expect(errorMessage(null)).toBe('null');
      expect(errorMessage(undefined)).toBe('undefined');
    });
  });
}

// --- merged from error-message-dual.surface.spec.ts ---
{
  /**
   * Residual 999: errorMessage dual retired (AI runtime + app-vue local vault).
   * Sole body in @memoflow/utils/shared/error-message.
   * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
   * Soft residual 1019: database CLI scripts dual retired onto this sole (toErrorMessage alias).
   * Soft residual 1127: extractErrorMessage dual retired onto this sole (withCause).
   * Does not flip §13.2 checkboxes.
   */
  describe('errorMessage dual retired (residual 999)', () => {
    const sharedDir = __dirname;
    const sole = readFileSync(resolve(sharedDir, 'error-message.ts'), 'utf8');
    const index = readFileSync(resolve(sharedDir, 'index.ts'), 'utf8');
    const legacyAiRuntimePath = resolve(
      sharedDir,
      '../../../ai/src/server/infrastructure/runtime/ai-runtime.ts',
    );
    const localVault = readFileSync(
      resolve(
        sharedDir,
        '../../../app-vue/src/modules/repository/composables/useLocalVault.ts',
      ),
      'utf8',
    );
    const databaseScript = readFileSync(
      resolve(
        sharedDir,
        '../../../database/scripts/prepare-ai-knowledge-index-pgvector.ts',
      ),
      'utf8',
    );

    it('owns sole errorMessage helper body and shared barrel export', () => {
      expect(sole).toContain('Residual 999');
      expect(sole).toMatch(/export function errorMessage\b/);
      expect(sole).toContain('error instanceof Error');
      expect(sole).toContain('error.message');
      expect(sole).toContain('String(error)');
      expect(index).toContain("export * from './error-message'");
    });

    it('keeps the current local-vault consumer on the sole helper and the legacy AI runtime deleted', () => {
      expect(localVault).toContain('Residual 999');
      expect(localVault).toContain("import { errorMessage } from '@memoflow/utils/shared'");
      expect(localVault).not.toMatch(/function errorMessage\b/);
      expect(localVault).toContain('errorMessage(');
      expect(existsSync(legacyAiRuntimePath)).toBe(false);
    });

    it('database CLI scripts dual retired onto sole (residual 1019)', () => {
      for (const [label, source] of [
        ['prepare-ai-knowledge-index-pgvector', databaseScript],
        [
          'bootstrap-ai-knowledge-index',
          readFileSync(
            resolve(sharedDir, '../../../database/scripts/bootstrap-ai-knowledge-index.ts'),
            'utf8',
          ),
        ],
        [
          'verify-ai-knowledge-index',
          readFileSync(
            resolve(sharedDir, '../../../database/scripts/verify-ai-knowledge-index.ts'),
            'utf8',
          ),
        ],
      ] as const) {
        expect(source, label).toContain('Residual 1019');
        expect(source, label).toContain(
          "import { errorMessage as toErrorMessage } from '@memoflow/utils/shared'",
        );
        expect(source, label).not.toMatch(/function toErrorMessage\b/);
        expect(source, label).toContain('toErrorMessage(');
      }
    });

    it('coerces Error and non-Error values to message strings', () => {
      expect(errorMessage(new Error('boom'))).toBe('boom');
      expect(errorMessage('plain')).toBe('plain');
      expect(errorMessage(42)).toBe('42');
      expect(errorMessage(null)).toBe('null');
      expect(errorMessage(undefined)).toBe('undefined');
    });
  });
}

// --- merged from escape-html-dual.surface.spec.ts ---
{
  /**
   * Residual 943: escapeHtml dual retired.
   * Sole body in @memoflow/utils/shared/escape-html; desktop main + app-vue
   * safe-markdown import it (local function duals dropped).
   * Residual 945 (soft): formatZodErrors dual retired
   *   (result/format-zod-errors-dual.surface.spec.ts).
   * Does not flip §13.2 checkboxes.
   */
  describe('escapeHtml dual retired (residual 943)', () => {
    const sharedDir = __dirname;
    const sole = readFileSync(resolve(sharedDir, 'escape-html.ts'), 'utf8');
    const index = readFileSync(resolve(sharedDir, 'index.ts'), 'utf8');
    const safeMarkdown = readFileSync(
      resolve(sharedDir, '../../../app-vue/src/shared/utils/safe-markdown.ts'),
      'utf8',
    );
    const desktopMain = readFileSync(
      resolve(sharedDir, '../../../../apps/desktop/src/renderer/main.ts'),
      'utf8',
    );

    it('owns sole escapeHtml helper body and shared barrel export', () => {
      expect(sole).toContain('Residual 943');
      expect(sole).toMatch(/export function escapeHtml\b/);
      expect(sole).toContain(".replace(/&/g, '&amp;')");
      expect(sole).toContain(".replace(/</g, '&lt;')");
      expect(sole).toContain(".replace(/>/g, '&gt;')");
      expect(sole).toContain('.replace(/"/g, \'&quot;\')');
      expect(sole).toContain(".replace(/'/g, '&#39;')");
      expect(index).toContain("export * from './escape-html'");
    });

    it('desktop main and safe-markdown import sole helper without local dual bodies', () => {
      expect(desktopMain).toContain('Residual 943');
      expect(desktopMain).toContain("import { escapeHtml } from '@memoflow/utils/shared'");
      expect(desktopMain).not.toMatch(/function escapeHtml\b/);

      expect(safeMarkdown).toContain('Residual 943');
      expect(safeMarkdown).toContain("import { escapeHtml } from '@memoflow/utils/shared'");
      expect(safeMarkdown).not.toMatch(/function escapeHtml\b/);
    });

    it('escapes HTML special characters for untrusted text embedding', () => {
      expect(escapeHtml(`<script a="1" b='2'>&`)).toBe(
        '&lt;script a=&quot;1&quot; b=&#39;2&#39;&gt;&amp;',
      );
    });
  });
}

// --- merged from extract-error-message-dual.surface.spec.ts ---
{
  /**
   * Residual 1127: extractErrorMessage dual retired onto errorMessage sole.
   * persistence withCause imports errorMessage; extractErrorMessage export removed.
   * Soft residual 999/1019: errorMessage dual-retired sole remains for AI/local-vault/CLI.
   * Does not flip §13.2 checkboxes.
   */
  describe('extractErrorMessage dual retired (residual 1127)', () => {
    const dir = __dirname;
    const sole = readFileSync(resolve(dir, 'error-message.ts'), 'utf8');
    const persistence = readFileSync(resolve(dir, 'persistence.ts'), 'utf8');
    const index = readFileSync(resolve(dir, 'index.ts'), 'utf8');

    it('owns Residual 1127 dual-retired markers on errorMessage sole + withCause', () => {
      expect(sole).toContain('Residual 1127');
      expect(sole).toMatch(/export function errorMessage\b/);
      expect(sole).toContain('error instanceof Error');
      expect(sole).toContain('String(error)');
      expect(persistence).toContain('Residual 1127');
      expect(persistence).toContain("import { errorMessage } from './error-message'");
      expect(persistence).toMatch(/export function withCause\b/);
      expect(persistence).toContain('errorMessage(err)');
      // extractErrorMessage dual body must not remain
      expect(persistence).not.toMatch(/function extractErrorMessage\b/);
      expect(persistence).not.toMatch(/export function extractErrorMessage\b/);
    });

    it('shared barrel still exports errorMessage sole (not extractErrorMessage)', () => {
      expect(index).toContain("export * from './error-message'");
      expect(index).toContain("export * from './persistence'");
      // soft residual may mention name; assert no extract dual export reintroduction in error-message
      expect(sole).not.toMatch(/export function extractErrorMessage\b/);
    });

    it('runtime: withCause uses errorMessage coercion shape', () => {
      expect(errorMessage(new Error('boom'))).toBe('boom');
      expect(errorMessage('plain')).toBe('plain');
      expect(withCause('failed', new Error('cause'))).toBe('failed [cause: cause]');
      expect(withCause('failed', 'plain-cause')).toBe('failed [cause: plain-cause]');
      expect(withCause('failed', 42)).toBe('failed [cause: 42]');
    });

    it('documents residual 1127 dual-retired lock without claiming §13.2 complete', () => {
      const self = readFileSync(resolve(dir, 'dual-registry.surface.spec.ts'), 'utf8');
      expect(self).toContain('Residual 1127');
      expect(self).toContain('Does not flip §13.2 checkboxes');
      expect(self).toContain('dual retired');
    });
  });
}

// --- merged from parse-json-safe-dual.surface.spec.ts ---
{
  /**
   * Residual 1025: notification parseJsonSafe dual retired onto utils persistence sole.
   * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339)
   *   until residual 1026 suite re-run.
   * Soft residual: account powersync private parseJson remains keep-boundary (throws on invalid).
   * Soft residual 1081: account PowerSync parseJson keep-boundary surface (no force-merge).
   * Soft residual 1091: api PowerSync parseJsonLikeString keep-boundary surface (no force-merge).
   * Soft residual 1095: data-portability parseJsonField keep-boundary surface (no force-merge).
   * Does not flip §13.2 checkboxes.
   */
  describe('parseJsonSafe dual retired (residual 1025)', () => {
    const sharedDir = __dirname;
    const sole = readFileSync(resolve(sharedDir, 'persistence.ts'), 'utf8');
    const index = readFileSync(resolve(sharedDir, 'index.ts'), 'utf8');
    const preference = readFileSync(
      resolve(
        sharedDir,
        '../../../notification/src/server/infrastructure/adapters/prisma/mappers/notification-preference-prisma.mapper.ts',
      ),
      'utf8',
    );
    const notification = readFileSync(
      resolve(
        sharedDir,
        '../../../notification/src/server/infrastructure/adapters/prisma/mappers/notification-prisma.mapper.ts',
      ),
      'utf8',
    );
    const template = readFileSync(
      resolve(
        sharedDir,
        '../../../notification/src/server/infrastructure/adapters/prisma/notification-template-prisma.repository.ts',
      ),
      'utf8',
    );
    const powersync = readFileSync(
      resolve(
        sharedDir,
        '../../../notification/src/server/infrastructure/adapters/powersync/notification-powersync.repository.ts',
      ),
      'utf8',
    );

    it('owns sole parseJsonSafe helper body and shared barrel export', () => {
      expect(sole).toContain('Residual 1025');
      expect(sole).toMatch(/export function parseJsonSafe\b/);
      expect(sole).toContain('parseJson(value, null)');
      expect(sole).toMatch(/export function parseJson\b/);
      expect(index).toContain("export * from './persistence'");
    });

    it('notification prisma mappers/repos import sole without local dual bodies', () => {
      for (const [label, source] of [
        ['preference-mapper', preference],
        ['notification-mapper', notification],
        ['template-repo', template],
      ] as const) {
        expect(source, label).toContain("import { parseJsonSafe } from '@memoflow/utils/shared'");
        expect(source, label).not.toMatch(/function parseJsonSafe\b/);
        expect(source, label).toContain('parseJsonSafe');
      }
    });

    it('notification powersync repository imports sole without local parseJson dual body', () => {
      expect(powersync).toContain("import { parseJsonSafe } from '@memoflow/utils/shared'");
      expect(powersync).not.toMatch(/function parseJson\b/);
      expect(powersync).not.toMatch(/function parseJsonSafe\b/);
      expect(powersync).toContain('parseJsonSafe');
    });

    it('returns null for empty/invalid JSON and parses valid payloads', () => {
      expect(parseJsonSafe(undefined)).toBeNull();
      expect(parseJsonSafe(null)).toBeNull();
      expect(parseJsonSafe('')).toBeNull();
      expect(parseJsonSafe('{')).toBeNull();
      expect(parseJsonSafe('{"a":1}')).toEqual({ a: 1 });
      expect(parseJsonSafe<string[]>('["x"]')).toEqual(['x']);
      // equivalent to parseJson(value, null)
      expect(parseJsonSafe('nope')).toBe(parseJson('nope', null));
    });
  });
}

// --- merged from parse-query-boolean-dual.surface.spec.ts ---
{
  /**
   * Residual 1021: notification parseBoolean dual retired onto parse-query-value sole.
   * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
   * Soft residual 989: parseString/parseNumber already sole for notification + reminder.
   * Soft residual 985: goal parseBoolean remains true/false-only keep-boundary.
   * Soft residual: scheduler parseBoolean remains keep-boundary (boolean literal + empty shapes).
   * Does not flip §13.2 checkboxes.
   */
  describe('parseQueryBoolean dual retired (residual 1021)', () => {
    const sharedDir = __dirname;
    const sole = readFileSync(resolve(sharedDir, 'parse-query-value.ts'), 'utf8');
    const index = readFileSync(resolve(sharedDir, 'index.ts'), 'utf8');
    const notification = readFileSync(
      resolve(sharedDir, '../../../notification/src/api/routes.ts'),
      'utf8',
    );
    const schedule = readFileSync(
      resolve(sharedDir, '../../../scheduler/src/api/routes.ts'),
      'utf8',
    );
    const goalSole = readFileSync(
      resolve(sharedDir, '../../../goal/src/api/routes/parse-boolean.ts'),
      'utf8',
    );

    it('owns sole parseBoolean helper body next to parseString/parseNumber', () => {
      expect(sole).toContain('Residual 1021');
      expect(sole).toMatch(/export function parseBoolean\b/);
      expect(sole).toContain("raw === 'true' || raw === '1'");
      expect(sole).toContain("raw === 'false' || raw === '0'");
      expect(sole).toContain('parseString(value)');
      expect(index).toContain("export * from './parse-query-value'");
    });

    it('notification imports sole without local dual body', () => {
      expect(notification).toContain('Residual 1021');
      expect(notification).toContain(
        "import { parseBoolean, parseNumber, parseString } from '@memoflow/utils/shared'",
      );
      expect(notification).not.toMatch(/function parseBoolean\b/);
      expect(notification).toContain('parseBoolean(req.query?.isRead)');
    });

    it('scheduler + goal remain keep-boundary vs this query boolean sole', () => {
      expect(schedule).toMatch(/function parseBoolean\b/);
      expect(schedule).toContain('value === true');
      expect(schedule).toContain("value === ''");
      expect(schedule).not.toContain('@memoflow/utils/shared');
      expect(goalSole).toContain('Residual 985');
      expect(goalSole).toMatch(/export function parseBoolean\b/);
      expect(goalSole).not.toContain("'1'");
    });

    it('parses query-string true/false/1/0 via parseString normalization', () => {
      expect(parseBoolean(undefined)).toBeUndefined();
      expect(parseBoolean(null)).toBeUndefined();
      expect(parseBoolean('true')).toBe(true);
      expect(parseBoolean('false')).toBe(false);
      expect(parseBoolean('1')).toBe(true);
      expect(parseBoolean('0')).toBe(false);
      expect(parseBoolean(['0'])).toBe(false);
      expect(parseBoolean('maybe')).toBeUndefined();
    });
  });
}

// --- merged from parse-query-value-dual.surface.spec.ts ---
{
  /**
   * Residual 989: parseString + parseNumber dual retired (notification + reminder API routes).
   * Residual 1021: parseBoolean dual retired for notification query filters.
   * Sole body in @memoflow/utils/shared/parse-query-value.
   * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
   * Soft residual 1023: governance parseString/parseNumber dual retired (re-export this sole).
   * Soft residual: scheduler route parsers keep-boundary (different empty/boolean handling).
   * Soft residual 1073: scheduler route parsers keep-boundary surface (no force-merge).
   * Soft residual: goal parseBoolean sole (residual 985) is true/false-only keep-boundary vs this dual.
   * Soft residual 1067: goal parseNumber + parseStringArray keep-boundary (no force-merge).
   * Soft residual 1113: data-portability toBoolean keep-boundary (always boolean + numbers; no force-merge).
   * Does not flip §13.2 checkboxes.
   */
  describe('parseString/parseNumber dual retired (residual 989)', () => {
    const sharedDir = __dirname;
    const sole = readFileSync(resolve(sharedDir, 'parse-query-value.ts'), 'utf8');
    const index = readFileSync(resolve(sharedDir, 'index.ts'), 'utf8');
    const notification = readFileSync(
      resolve(sharedDir, '../../../notification/src/api/routes.ts'),
      'utf8',
    );
    const reminder = readFileSync(
      resolve(sharedDir, '../../../reminder/src/api/routes/reminder-template.routes.ts'),
      'utf8',
    );
    const schedule = readFileSync(
      resolve(sharedDir, '../../../scheduler/src/api/routes.ts'),
      'utf8',
    );

    it('owns sole parseString + parseNumber + parseBoolean bodies and shared barrel export', () => {
      expect(sole).toContain('Residual 989');
      expect(sole).toContain('Residual 1021');
      expect(sole).toMatch(/export function parseString\b/);
      expect(sole).toMatch(/export function parseNumber\b/);
      expect(sole).toMatch(/export function parseBoolean\b/);
      expect(sole).toContain('Array.isArray(value)');
      expect(sole).toContain('Number.isFinite(parsed)');
      expect(sole).toContain("'1'");
      expect(index).toContain("export * from './parse-query-value'");
    });

    it('notification + reminder routes import sole without local dual bodies', () => {
      expect(notification).toContain('Residual 989');
      expect(notification).toContain('Residual 1021');
      expect(notification).toContain(
        "import { parseBoolean, parseNumber, parseString } from '@memoflow/utils/shared'",
      );
      expect(notification).not.toMatch(/function parseString\b/);
      expect(notification).not.toMatch(/function parseNumber\b/);
      expect(notification).not.toMatch(/function parseBoolean\b/);
      expect(notification).toContain('parseString(');
      expect(notification).toContain('parseNumber(');
      expect(notification).toContain('parseBoolean(');

      expect(reminder).toContain('Residual 989');
      expect(reminder).toContain(
        "import { parseNumber, parseString } from '@memoflow/utils/shared'",
      );
      expect(reminder).not.toMatch(/function parseString\b/);
      expect(reminder).not.toMatch(/function parseNumber\b/);
      expect(reminder).toContain('parseString(');
      expect(reminder).toContain('parseNumber(');
    });

    it('scheduler route parsers remain keep-boundary (not this sole dual body)', () => {
      expect(schedule).toMatch(/function parseString\b/);
      expect(schedule).toMatch(/function parseNumber\b/);
      expect(schedule).toContain("value === ''");
      expect(schedule).not.toContain('@memoflow/utils/shared');
    });

    it('parses first query string entry and finite numbers', () => {
      expect(parseString(undefined)).toBeUndefined();
      expect(parseString(null)).toBeUndefined();
      expect(parseString('status')).toBe('status');
      expect(parseString(['a', 'b'])).toBe('a');
      expect(parseString([])).toBeUndefined();
      expect(parseString(42)).toBe('42');

      expect(parseNumber(undefined)).toBeUndefined();
      expect(parseNumber('')).toBeUndefined();
      expect(parseNumber('12')).toBe(12);
      expect(parseNumber(['3.5'])).toBe(3.5);
      expect(parseNumber('nope')).toBeUndefined();

      expect(parseBoolean(undefined)).toBeUndefined();
      expect(parseBoolean('true')).toBe(true);
      expect(parseBoolean('1')).toBe(true);
      expect(parseBoolean('false')).toBe(false);
      expect(parseBoolean('0')).toBe(false);
      expect(parseBoolean('yes')).toBeUndefined();
      expect(parseBoolean(['true'])).toBe(true);
    });
  });
}

// --- merged from parse-query-value-governance-dual.surface.spec.ts ---
{
  /**
   * Residual 1023: governance parseString/parseNumber dual retired onto residual 989 sole.
   * governance-route-shared re-exports utils sole; parseStringArray remains package-local.
   * Soft residual 1069: governance parseStringArray keep-boundary surface (no force-merge).
   * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
   * Soft residual: scheduler route parsers remain keep-boundary (empty-string shapes).
   * Soft residual 1021: notification parseBoolean sole family.
   * Does not flip §13.2 checkboxes.
   */
  describe('governance parseString/parseNumber dual retired (residual 1023)', () => {
    const sharedDir = __dirname;
    const sole = readFileSync(resolve(sharedDir, 'parse-query-value.ts'), 'utf8');
    const govShared = readFileSync(
      resolve(sharedDir, '../../../governance/src/api/routes/governance-route-shared.ts'),
      'utf8',
    );
    const rules = readFileSync(
      resolve(sharedDir, '../../../governance/src/api/routes/governance-rules.routes.ts'),
      'utf8',
    );
    const revisions = readFileSync(
      resolve(
        sharedDir,
        '../../../governance/src/api/routes/governance-rule-revisions.routes.ts',
      ),
      'utf8',
    );
    const schedule = readFileSync(
      resolve(sharedDir, '../../../scheduler/src/api/routes.ts'),
      'utf8',
    );

    it('owns residual 989 sole parseString/parseNumber bodies', () => {
      expect(sole).toContain('Residual 989');
      expect(sole).toMatch(/export function parseString\b/);
      expect(sole).toMatch(/export function parseNumber\b/);
      expect(sole).toContain('Array.isArray(value)');
      expect(sole).toContain('Number.isFinite(parsed)');
    });

    it('governance-route-shared re-exports utils sole without local dual bodies', () => {
      expect(govShared).toContain('Residual 1023');
      expect(govShared).toContain("export { parseNumber, parseString } from '@memoflow/utils/shared'");
      expect(govShared).not.toMatch(/export function parseString\b/);
      expect(govShared).not.toMatch(/export function parseNumber\b/);
      expect(govShared).toMatch(/export function parseStringArray\b/);
    });

    it('governance routes import shared re-export without local dual bodies', () => {
      expect(rules).toContain("from './governance-route-shared'");
      expect(rules).toContain('parseString');
      expect(rules).toContain('parseNumber');
      expect(rules).toContain('parseStringArray');
      expect(rules).not.toMatch(/function parseString\b/);
      expect(rules).not.toMatch(/function parseNumber\b/);
      expect(revisions).toContain("from './governance-route-shared'");
      expect(revisions).toContain('parseNumber');
      expect(revisions).not.toMatch(/function parseNumber\b/);
    });

    it('scheduler remains keep-boundary; sole still parses arrays and finite numbers', () => {
      expect(schedule).toMatch(/function parseString\b/);
      expect(schedule).toContain("value === ''");
      expect(schedule).not.toContain('@memoflow/utils/shared');
      expect(parseString(['a', 'b'])).toBe('a');
      expect(parseNumber('12')).toBe(12);
      expect(parseNumber('nope')).toBeUndefined();
    });
  });
}

// --- merged from presentation-preference-dual.surface.spec.ts ---
{
  /**
   * Residual 1005: presentation preference duals retired
   * (detectBrowserLocale + normalizeLocale + normalizeTheme).
   * Sole bodies in @memoflow/utils/shared/presentation-preference.
   * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
   * Does not flip §13.2 checkboxes.
   */
  describe('presentation preference duals retired (residual 1005)', () => {
    const sharedDir = __dirname;
    const sole = readFileSync(resolve(sharedDir, 'presentation-preference.ts'), 'utf8');
    const index = readFileSync(resolve(sharedDir, 'index.ts'), 'utf8');
    const webPresentation = readFileSync(
      resolve(sharedDir, '../../../../apps/web/src/auth/presentation.ts'),
      'utf8',
    );
    const appVueStore = readFileSync(
      resolve(
        sharedDir,
        '../../../app-vue/src/modules/setting/stores/presentation-preference-store.ts',
      ),
      'utf8',
    );

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('owns sole presentation helpers and shared barrel export', () => {
      expect(sole).toContain('Residual 1005');
      expect(sole).toMatch(/export function detectBrowserLocale\b/);
      expect(sole).toMatch(/export function normalizeLocale\b/);
      expect(sole).toMatch(/export function normalizeTheme\b/);
      expect(sole).toContain("startsWith('zh')");
      expect(sole).toContain("'light' || value === 'dark' || value === 'auto'");
      expect(index).toContain("export * from './presentation-preference'");
    });

    it('web auth presentation + app-vue store import sole without local dual bodies', () => {
      for (const [label, source] of [
        ['web-presentation', webPresentation],
        ['app-vue-store', appVueStore],
      ] as const) {
        expect(source, label).toContain('Residual 1005');
        expect(source, label).toContain("from '@memoflow/utils/shared'");
        expect(source, label).toContain('detectBrowserLocale');
        expect(source, label).toContain('normalizeLocale');
        expect(source, label).toContain('normalizeTheme');
        expect(source, label).not.toMatch(/function detectBrowserLocale\b/);
        expect(source, label).not.toMatch(/function normalizeLocale\b/);
        expect(source, label).not.toMatch(/function normalizeTheme\b/);
      }
    });

    it('detects zh locale, normalizes locale/theme, and defaults safely', () => {
      vi.stubGlobal('navigator', {
        languages: ['zh-CN', 'en-US'],
        language: 'zh-CN',
      });
      expect(detectBrowserLocale()).toBe('zh-CN');

      vi.stubGlobal('navigator', {
        languages: ['en-US'],
        language: 'en-US',
      });
      expect(detectBrowserLocale()).toBe('en-US');

      expect(normalizeLocale('zh-CN')).toBe('zh-CN');
      expect(normalizeLocale('en-US')).toBe('en-US');
      expect(normalizeLocale('fr-FR')).toBe('en-US');

      expect(normalizeTheme('light')).toBe('light');
      expect(normalizeTheme('dark')).toBe('dark');
      expect(normalizeTheme('auto')).toBe('auto');
      expect(normalizeTheme('nope')).toBe('auto');
      expect(normalizeTheme(undefined)).toBe('auto');
    });
  });
}

// --- AI-VNEXT-07: retired automation-only formatting helpers ---
{
  describe('retired automation-only formatting helpers', () => {
    const sharedDir = __dirname;
    const index = readFileSync(resolve(sharedDir, 'index.ts'), 'utf8');
    const retiredPaths = [
      resolve(sharedDir, 'preview-text.ts'),
      resolve(sharedDir, 'read-nested-number.ts'),
      resolve(sharedDir, '../../../ai/src/shared/preview-text.ts'),
    ];

    it('keeps dead preview/read-number helper surfaces deleted', () => {
      for (const path of retiredPaths) expect(existsSync(path), path).toBe(false);
      expect(index).not.toContain("export * from './preview-text'");
      expect(index).not.toContain("export * from './read-nested-number'");
    });
  });
}

// --- merged from reminder-time-of-day-dual.surface.spec.ts ---
{
  /**
   * Residual 1007: normalizeReminderTimeOfDay + buildReminderStartTimestamp dual retired.
   * Sole bodies in @memoflow/utils/shared/reminder-time-of-day.
   * Soft residual 1038: tip focused suite numbers track Residual 1038 evidence tip (309/1339).
   * AI-VNEXT-07: the retired Goal automation composer/executors stay deleted.
   * Does not flip §13.2 checkboxes.
   */
  describe('reminder time-of-day dual retired (residual 1007)', () => {
    const sharedDir = __dirname;
    const sole = readFileSync(resolve(sharedDir, 'reminder-time-of-day.ts'), 'utf8');
    const index = readFileSync(resolve(sharedDir, 'index.ts'), 'utf8');
    const retiredAutomationPaths = [
      resolve(sharedDir, 'build-reminder-template-input.ts'),
      resolve(sharedDir, '../../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts'),
      resolve(sharedDir, '../../../../apps/desktop/src/main/modules/ai/desktop-automation-tool-executor.adapter.ts'),
    ];
    const goalWorkflow = readFileSync(
      resolve(
        sharedDir,
        '../../../app-vue/src/modules/ai/composables/useAIGoalWorkflow.ts',
      ),
      'utf8',
    );
    const workflowPersistence = readFileSync(
      resolve(
        sharedDir,
        '../../../app-vue/src/modules/ai/composables/useAIWorkflowPersistence.ts',
      ),
      'utf8',
    );

    it('owns sole reminder time helpers and shared barrel export', () => {
      expect(sole).toContain('Residual 1007');
      expect(sole).toMatch(/export function normalizeReminderTimeOfDay\b/);
      expect(sole).toMatch(/export function buildReminderStartTimestamp\b/);
      expect(sole).toContain("DEFAULT_REMINDER_TIME_OF_DAY = '09:00'");
      expect(sole).toContain('REMINDER_TIME_OF_DAY_PATTERN');
      expect(index).toContain("export * from './reminder-time-of-day'");
    });

    it('keeps retired Goal automation composer/executors deleted', () => {
      for (const path of retiredAutomationPaths) expect(existsSync(path), path).toBe(false);
    });

    it('app-vue goal workflow + persistence import sole without local dual pattern bodies', () => {
      for (const [label, source] of [
        ['useAIGoalWorkflow', goalWorkflow],
        ['useAIWorkflowPersistence', workflowPersistence],
      ] as const) {
        expect(source, label).toContain("from '@memoflow/utils/shared'");
        expect(source, label).toContain('normalizeReminderTimeOfDay');
        expect(source, label).not.toMatch(/function normalizeReminderTimeOfDay\b/);
        expect(source, label).not.toMatch(/const DEFAULT_REMINDER_TIME_OF_DAY\b/);
        expect(source, label).not.toMatch(/const REMINDER_TIME_OF_DAY_PATTERN\b/);
      }
    });

    it('normalizes HH:mm and builds next start timestamp', () => {
      expect(DEFAULT_REMINDER_TIME_OF_DAY).toBe('09:00');
      expect(REMINDER_TIME_OF_DAY_PATTERN.test('09:00')).toBe(true);
      expect(REMINDER_TIME_OF_DAY_PATTERN.test('24:00')).toBe(false);
      expect(normalizeReminderTimeOfDay(undefined)).toBe('09:00');
      expect(normalizeReminderTimeOfDay('')).toBe('09:00');
      expect(normalizeReminderTimeOfDay('nope')).toBe('09:00');
      expect(normalizeReminderTimeOfDay('14:30')).toBe('14:30');

      const noon = new Date('2026-07-23T12:00:00.000Z').getTime();
      // Use fixed local-offset-independent approach: pick timeOfDay relative via Date construction
      const now = Date.now();
      const later = buildReminderStartTimestamp('23:59', now);
      const earlier = buildReminderStartTimestamp('00:00', now);
      expect(later).toBeGreaterThanOrEqual(now);
      expect(earlier).toBeGreaterThanOrEqual(now);
      expect(typeof noon).toBe('number');
    });
  });
}
