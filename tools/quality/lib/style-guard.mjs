/**
 * Pure core for the style guard (issue #946).
 *
 * Scope: only lines added by the current change. Existing arbitrary values are
 * intentionally not audited; the guard exists to stop new drift.
 *
 * Managed dimensions are the geometry dimensions that already have a Tailwind
 * theme scale: spacing (padding/margin/gap/width/height/inset/translate), and
 * border radius. Colors and typography are different problems and are out of
 * scope for this guard.
 */

/** Utilities whose theme scale is derived from the `--spacing` step (0.25rem). */
const SPACING_UTILITIES = [
  'p',
  'px',
  'py',
  'ps',
  'pe',
  'pt',
  'pr',
  'pb',
  'pl',
  'm',
  'mx',
  'my',
  'ms',
  'me',
  'mt',
  'mr',
  'mb',
  'ml',
  'space-x',
  'space-y',
  'gap',
  'gap-x',
  'gap-y',
  'w',
  'h',
  'size',
  'min-w',
  'min-h',
  'max-w',
  'max-h',
  'inset',
  'inset-x',
  'inset-y',
  'top',
  'right',
  'bottom',
  'left',
  'start',
  'end',
  'translate-x',
  'translate-y',
  'scroll-m',
  'scroll-mx',
  'scroll-my',
  'scroll-ms',
  'scroll-me',
  'scroll-mt',
  'scroll-mr',
  'scroll-mb',
  'scroll-ml',
  'scroll-p',
  'scroll-px',
  'scroll-py',
  'scroll-ps',
  'scroll-pe',
  'scroll-pt',
  'scroll-pr',
  'scroll-pb',
  'scroll-pl',
  'border-spacing',
  'border-spacing-x',
  'border-spacing-y',
];

/** Utilities backed by the theme radius scale (`--radius-*`). */
const RADIUS_UTILITIES = [
  'rounded',
  'rounded-s',
  'rounded-e',
  'rounded-t',
  'rounded-r',
  'rounded-b',
  'rounded-l',
  'rounded-ss',
  'rounded-se',
  'rounded-ee',
  'rounded-es',
  'rounded-tl',
  'rounded-tr',
  'rounded-br',
  'rounded-bl',
];

export const MANAGED_DIMENSIONS = Object.freeze([
  { id: 'spacing', label: '间距/尺寸', utilities: Object.freeze(SPACING_UTILITIES) },
  { id: 'radius', label: '圆角', utilities: Object.freeze(RADIUS_UTILITIES) },
]);

/** Extensions that carry utility classes or inline styles. */
export const STYLE_EXTENSIONS = new Set(['.vue', '.tsx', '.jsx', '.ts', '.html']);

export const STYLE_RULE_SUMMARY =
  '间距/尺寸/圆角等有令牌刻度的维度只能用刻度类；任意值只允许用于无刻度的真几何场景，' +
  '并在豁免登记文件按“文件 + token + 原因”逐条登记；内联 style 只允许绑定运行时计算值。';

const UTILITY_TO_DIMENSION = new Map();
for (const dimension of MANAGED_DIMENSIONS) {
  for (const utility of dimension.utilities) UTILITY_TO_DIMENSION.set(utility, dimension);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

const UTILITY_ALTERNATION = [...UTILITY_TO_DIMENSION.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');

// `-mt-[3px]`, `!-mt-[3px]`, `md:-mt-[3px]` all collapse to utility + value
// here; the variant prefix is deliberately left outside the match.
const ARBITRARY_UTILITY = new RegExp(
  String.raw`(?<![\w-])(!?-?)(${UTILITY_ALTERNATION})-\[([^\]\s]+)\]`,
  'gu',
);

const STATIC_STYLE_ATTRIBUTE = /(?:^|\s)style\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;
const BOUND_STYLE_ATTRIBUTE = /(?:^|\s)(?::|v-bind:)style\s*=\s*(?:"([^"]*)"|'([^']*)')/gu;

const IGNORED_LINE_PREFIXES = ['//', '*', '/*', '<!--', '#'];

function isIgnoredLine(text) {
  const trimmed = text.trimStart();
  return IGNORED_LINE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

/** `w-[var(--sidebar-width)]` / `w-[--sidebar-width]` reference a token, not a literal. */
export function isTokenReference(value) {
  return /^(?:var\(--[\w-]+(?:\s*,[^)]*)?\)|--[\w-]+)$/u.test(value);
}

function stripStringLiterals(expression) {
  return expression.replace(/'([^'\\]|\\.)*'|"([^"\\]|\\.)*"|`([^`\\]|\\.)*`/gu, '""');
}

function splitTopLevel(expression, separator = ',') {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < expression.length; i += 1) {
    const ch = expression[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === separator && depth === 0) {
      parts.push(expression.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(expression.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function topLevelColon(expression) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < expression.length; i += 1) {
    const ch = expression[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === ':' && depth === 0) return i;
  }
  return -1;
}

function isStaticStringLiteral(expression) {
  const value = expression.trim();
  if (value.length < 2) return false;
  const quote = value[0];
  if (quote !== "'" && quote !== '"' && quote !== '`') return false;
  if (!value.endsWith(quote)) return false;
  const body = value.slice(1, -1);
  if (quote === '`' && body.includes('${')) return false;
  let escaped = false;
  for (const ch of body) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === quote) return false;
  }
  return true;
}

function isStaticStyleValue(expression) {
  const value = expression.trim();
  if (!value) return false;
  if (isStaticStringLiteral(value)) return true;
  if (/^-?\d+(?:\.\d+)?$/u.test(value)) return true;
  return value === 'true' || value === 'false' || value === 'null';
}

function isStaticStyleObject(expression) {
  const value = expression.trim();
  if (!value.startsWith('{') || !value.endsWith('}')) return false;
  const body = value.slice(1, -1).trim();
  if (!body) return true;
  for (const entry of splitTopLevel(body)) {
    const colon = topLevelColon(entry);
    // Shorthand `{ color }` reads a variable, so the style is runtime-computed.
    if (colon < 0) return false;
    if (!isStaticStyleValue(entry.slice(colon + 1))) return false;
  }
  return true;
}

/** True when a `:style` binding is a literal, i.e. static styling in disguise. */
export function isStaticStyleExpression(expression) {
  const value = expression.trim();
  if (!value) return false;
  if (isStaticStringLiteral(value)) return true;
  if (value.startsWith('{')) return isStaticStyleObject(value);
  // `'width: ' + width` is a runtime value, not a static style.
  const stripped = stripStringLiterals(value).trim();
  return stripped === '""' || /^""(?:\s*\+\s*""\s*)+$/u.test(stripped);
}

function finding(kind, token, dimension, message, fix) {
  return { kind, token, dimension, message, fix };
}

/** Scan a single added line for managed arbitrary utilities and static styles. */
export function scanLine(text) {
  if (isIgnoredLine(text)) return [];
  const findings = [];
  const seen = new Set();

  for (const match of text.matchAll(ARBITRARY_UTILITY)) {
    const [, , utility, value] = match;
    if (isTokenReference(value)) continue;
    const dimension = UTILITY_TO_DIMENSION.get(utility);
    const token = match[0];
    if (!dimension || seen.has(`arbitrary:${token}`)) continue;
    seen.add(`arbitrary:${token}`);
    findings.push(
      finding(
        'arbitrary',
        token,
        dimension.id,
        `${token}：${dimension.label}有 Tailwind 主题刻度，新增代码必须使用刻度值。`,
        `改用刻度类（如 ${scaleHint(dimension.id, utility)}）；确属无刻度的真几何场景` +
          `（绝对定位偏移、画布/图表容器尺寸、第三方组件对接尺寸）时，在豁免登记文件追加` +
          ` {"file":"<相对路径>","token":"${token}","reason":"<原因>"}。`,
      ),
    );
  }

  for (const match of text.matchAll(STATIC_STYLE_ATTRIBUTE)) {
    const value = match[1] ?? match[2] ?? '';
    if (!value.trim() || seen.has('inline:static')) continue;
    seen.add('inline:static');
    findings.push(
      finding(
        'inline-style',
        `style="${value}"`,
        null,
        '静态内联 style：内联 style 只允许绑定运行时计算值，静态样式必须使用工具类或设计令牌。',
        '改为刻度类 / 语义令牌类；运行时尺寸请用 :style 绑定数据变量（如 :style="{ height: rowHeight + \'px\' }"）。',
      ),
    );
  }

  for (const match of text.matchAll(BOUND_STYLE_ATTRIBUTE)) {
    const expression = match[1] ?? match[2] ?? '';
    if (!isStaticStyleExpression(expression) || seen.has('inline:static')) continue;
    seen.add('inline:static');
    findings.push(
      finding(
        'inline-style',
        `:style="${expression}"`,
        null,
        '绑定内联 style 里写的是静态字面量：它和 style="…" 等价，只允许绑定运行时计算值。',
        '把字面量移到工具类 / 设计令牌；确有运行时计算时绑定数据变量或 computed。',
      ),
    );
  }

  return findings;
}

function scaleHint(dimension, utility) {
  if (dimension === 'radius') return `${utility}-md / ${utility}-lg`;
  return `${utility}-4`;
}

/**
 * Parse `git diff --unified=0` output into per-file added lines.
 * Returns `[{ file, lines: [{ line, text }] }]` in diff order.
 */
export function parseAddedLines(diff) {
  const files = new Map();
  let current = null;
  let lineNumber = 0;
  for (const raw of diff.split(/\r?\n/u)) {
    if (raw.startsWith('diff --git ')) {
      current = null;
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const target = raw.slice(4).trim();
      const unquoted =
        target.startsWith('"') && target.endsWith('"')
          ? target.slice(1, -1).replace(/\\(.)/gu, '$1')
          : target;
      const file = unquoted === '/dev/null' ? null : unquoted.replace(/^b\//u, '');
      current = file;
      if (current && !files.has(current)) files.set(current, []);
      continue;
    }
    if (raw.startsWith('@@')) {
      const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/u.exec(raw);
      lineNumber = header ? Number(header[1]) : 0;
      continue;
    }
    if (!current) continue;
    if (raw.startsWith('+')) {
      files.get(current).push({ line: lineNumber, text: raw.slice(1) });
      lineNumber += 1;
    } else if (raw.startsWith(' ')) {
      lineNumber += 1;
    }
  }
  return [...files.entries()]
    .filter(([, lines]) => lines.length > 0)
    .map(([file, lines]) => ({ file, lines }));
}

export function isStyleFile(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith('.d.ts')) return false;
  if (/(?:^|\/)(?:__tests__|node_modules)\//u.test(file)) return false;
  if (/\.(?:test|spec|stories)\.[cm]?[jt]sx?$/u.test(lower)) return false;
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return false;
  return STYLE_EXTENSIONS.has(lower.slice(dot));
}

/**
 * Build the violation list for added lines.
 * `entries` is the parsed exemption registry; an entry matches when both the
 * relative file and the exact utility token match.
 */
export function collectViolations(addedFiles, entries = []) {
  const exempt = new Set(
    entries.filter(isUsableEntry).map((entry) => `${entry.file}\0${entry.token}`),
  );
  const violations = [];
  for (const { file, lines } of addedFiles) {
    if (!isStyleFile(file)) continue;
    for (const { line, text } of lines) {
      for (const item of scanLine(text)) {
        if (item.kind === 'arbitrary' && exempt.has(`${file}\0${item.token}`)) continue;
        violations.push({ file, line, ...item });
      }
    }
  }
  return violations;
}

function isUsableEntry(entry) {
  return (
    entry &&
    typeof entry.file === 'string' &&
    typeof entry.token === 'string' &&
    typeof entry.reason === 'string' &&
    entry.reason.trim().length > 0
  );
}

/**
 * Validate the exemption registry. Any entry that no longer corresponds to an
 * existing usage is stale and fails the run, so the registry cannot rot.
 * `readFile` is injected so tests can supply a fixture filesystem.
 */
export function validateExemptions(entries, readFile) {
  const problems = [];
  if (!Array.isArray(entries)) {
    return [{ kind: 'shape', message: 'entries 必须是数组' }];
  }
  const seen = new Set();
  entries.forEach((entry, index) => {
    const label = `entries[${index}]`;
    if (!entry || typeof entry !== 'object') {
      problems.push({ kind: 'shape', message: `${label} 必须是对象` });
      return;
    }
    if (typeof entry.file !== 'string' || !entry.file.trim()) {
      problems.push({ kind: 'shape', message: `${label}.file 缺失` });
      return;
    }
    if (!isStyleFile(entry.file)) {
      problems.push({
        kind: 'shape',
        message: `${label}.file 不是受管样式文件：${entry.file}`,
      });
      return;
    }
    if (typeof entry.token !== 'string' || !/\[[^\]]+\]$/u.test(entry.token)) {
      problems.push({
        kind: 'shape',
        message: `${label}.token 必须是被豁免的完整任意值 token（含 [...])`,
      });
      return;
    }
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) {
      problems.push({ kind: 'shape', message: `${label}.reason 必须写明豁免原因` });
      return;
    }
    const key = `${entry.file}\0${entry.token}`;
    if (seen.has(key)) {
      problems.push({
        kind: 'duplicate',
        message: `${entry.file} 的 ${entry.token} 重复登记，请合并为一条`,
      });
    }
    seen.add(key);
    let content = null;
    try {
      content = readFile(entry.file);
    } catch {
      content = null;
    }
    if (content === null || content === undefined) {
      problems.push({
        kind: 'stale',
        message: `${entry.file} 不存在；删除该条登记（${entry.token}）`,
      });
      return;
    }
    if (!content.includes(entry.token)) {
      problems.push({
        kind: 'stale',
        message: `${entry.file} 已无 ${entry.token} 的使用；删除这条腐烂登记`,
      });
    }
  });
  return problems;
}
