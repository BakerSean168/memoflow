import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findSourceLockViolations,
  stripComments,
  validateSourceLockManifest,
} from '../lib/app-vue-source-locks.mjs';
import manifest from '../app-vue-source-locks.json' with { type: 'json' };

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture(files) {
  const root = path.join(tmpdir(), `memoflow-source-locks-${crypto.randomUUID()}`);
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}
const entry = (locks) => ({
  version: 1,
  entries: [
    { id: 'x', decision: 'ADR-x', locks: locks.map((lock) => ({ reason: 'test', ...lock })) },
  ],
});

describe('app-vue source locks governance', () => {
  it('reports forbidden tokens, missing required tokens and retired paths', () => {
    const root = fixture({
      'src/a.ts': "import { legacyHelper } from './legacy';\nexport const ok = canonical();\n",
      'src/legacy.ts': 'export {}',
    });
    const violations = findSourceLockViolations(
      root,
      entry([
        {
          file: 'src/a.ts',
          forbid: ['legacyHelper', { pattern: 'canon\\w+\\(' }],
          require: ['missingThing'],
        },
        { absentPaths: ['src/legacy.ts'], presentPaths: ['src/a.ts', 'src/gone.ts'] },
      ]),
    );
    expect(violations.map((v) => v.detail)).toEqual([
      'forbidden "legacyHelper"',
      'forbidden /canon\\w+\\(/',
      'required "missingThing" missing',
      'retired path exists',
      'required path missing',
    ]);
  });

  it('ignores comments only when the lock opts into stripComments', () => {
    const root = fixture({
      'src/a.ts': '// legacyHelper was retired\n/* legacyHelper */\nexport {};\n',
    });
    expect(
      findSourceLockViolations(
        root,
        entry([{ file: 'src/a.ts', stripComments: true, forbid: ['legacyHelper'] }]),
      ),
    ).toEqual([]);
    expect(
      findSourceLockViolations(root, entry([{ file: 'src/a.ts', forbid: ['legacyHelper'] }])),
    ).toHaveLength(1);
    expect(stripComments('x\n  // b\n/* c */d')).toBe('x\n\nd');
  });

  it('applies scan locks to matching files under a root, honouring excludes', () => {
    const root = fixture({
      'mod/a.ts': 'invalidateQueries(x)',
      'mod/nested/b.vue': '<script>\n// invalidateQueries(\n</script>',
      'mod/a.spec.ts': 'invalidateQueries(x)',
      'mod/c.md': 'invalidateQueries(',
    });
    const lock = {
      scan: { root: 'mod', extensions: ['.ts', '.vue'], exclude: ['.spec.'] },
      stripComments: true,
      forbid: ['invalidateQueries('],
    };
    expect(findSourceLockViolations(root, entry([lock])).map((v) => v.file)).toEqual(['mod/a.ts']);
    expect(
      findSourceLockViolations(root, entry([{ ...lock, scan: { ...lock.scan, root: 'gone' } }]))[0]
        .detail,
    ).toBe('scan root missing');
    expect(
      validateSourceLockManifest(
        entry([{ scan: { root: 'mod', extensions: [] }, forbid: ['x'] }]),
      )[0],
    ).toMatch(/root and extensions/);
  });

  it('applies region, count and order refinements and combined file surfaces', () => {
    const root = fixture({
      'src/a.ts':
        'function keep(value) {\n  return Number.isFinite(value);\n}\nfunction other() {\n  return new Date();\n}\nfirst(); second(); first();\n',
      'src/b.ts': 'export const b = 1;\n',
    });
    const run = (lock) => findSourceLockViolations(root, entry([lock])).map((v) => v.detail);
    expect(
      run({
        file: 'src/a.ts',
        region: { pattern: 'function keep\\([\\s\\S]*?\\n\\}' },
        require: ['Number.isFinite'],
        forbid: ['new Date('],
      }),
    ).toEqual([]);
    expect(
      run({
        file: 'src/a.ts',
        region: { start: 'function other', end: 'first()' },
        forbid: ['new Date('],
      }),
    ).toEqual(['forbidden "new Date("']);
    expect(
      run({ file: 'src/a.ts', region: { start: 'missing', length: 10 }, forbid: ['x'] }),
    ).toEqual(['region did not match']);
    expect(run({ file: 'src/a.ts', region: { pattern: 'nope' }, require: ['keep'] })).toEqual([
      'region did not match',
    ]);
    expect(
      run({
        file: 'src/a.ts',
        count: [
          { pattern: 'first\\(\\)', equals: 2 },
          { pattern: 'second', min: 2 },
        ],
      }),
    ).toEqual(['count /second/ is 1, expected >= 2']);
    expect(run({ file: 'src/a.ts', order: [{ tokens: ['second()', 'first()'] }] })).toEqual([]);
    expect(
      run({ file: 'src/a.ts', order: [{ tokens: ['second()', 'first()'], chained: false }] }),
    ).toEqual(['order "second()" < "first()" broken']);
    expect(
      run({ files: ['src/a.ts', 'src/b.ts'], require: ['export const b', 'function keep'] }),
    ).toEqual([]);
    expect(run({ files: ['src/a.ts', 'src/gone.ts'], forbid: ['x'] })).toEqual([
      'locked file missing',
    ]);
    expect(
      validateSourceLockManifest(entry([{ file: 'a.ts', count: [{ pattern: 'x' }] }]))[0],
    ).toMatch(/needs equals or min/);
    expect(
      validateSourceLockManifest(entry([{ file: 'a.ts', order: [{ tokens: ['x'] }] }]))[0],
    ).toMatch(/at least two string tokens/);
    expect(
      validateSourceLockManifest(entry([{ file: 'a.ts', region: {}, require: ['x'] }]))[0],
    ).toMatch(/region must be/);
  });

  it('fails closed when a negative-only region does not match', () => {
    const root = fixture({ 'src/a.ts': 'export function keep() {\n  return 1;\n}\n' });
    const run = (lock) => findSourceLockViolations(root, entry([lock])).map((v) => v.detail);
    expect(
      run({ file: 'src/a.ts', region: { pattern: 'function retired\\(' }, forbid: ['new Date('] }),
    ).toEqual(['region did not match']);
    expect(
      run({
        file: 'src/a.ts',
        region: { start: 'function retired', end: '}' },
        forbid: ['new Date('],
      }),
    ).toEqual(['region did not match']);
    expect(
      run({
        file: 'src/a.ts',
        region: { start: 'function keep', end: 'function gone' },
        forbid: ['new Date('],
      }),
    ).toEqual(['region did not match']);
  });

  it('requires a reason for every lock', () => {
    expect(
      validateSourceLockManifest({
        version: 1,
        entries: [{ id: 'x', decision: 'ADR-x', locks: [{ file: 'a.ts', forbid: ['x'] }] }],
      }),
    ).toContain('entries[0].locks[0].reason is required');
  });

  it('fails closed on a locked file that disappeared', () => {
    const root = fixture({});
    expect(
      findSourceLockViolations(root, entry([{ file: 'src/a.ts', forbid: ['x'] }]))[0].detail,
    ).toBe('locked file missing');
  });

  it('rejects malformed manifests', () => {
    expect(validateSourceLockManifest({ version: 1, entries: [] })).toContain(
      'entries must be a non-empty array',
    );
    expect(validateSourceLockManifest(entry([{ file: 'a.ts' }]))[0]).toMatch(
      /declares no forbid\/require/,
    );
    expect(
      validateSourceLockManifest(entry([{ file: 'a.ts', forbid: [{ pattern: '(' }] }]))[0],
    ).toMatch(/invalid matcher/);
    expect(
      validateSourceLockManifest(entry([{ file: 'a.ts', absentPaths: ['b'], forbid: ['x'] }]))[0],
    ).toMatch(/exactly one of file, absent\/presentPaths or scan/);
  });

  it('keeps the checked-in manifest valid and passing against the workspace', () => {
    expect(validateSourceLockManifest(manifest)).toEqual([]);
    const root = path.resolve(import.meta.dirname, '../../..');
    expect(findSourceLockViolations(root, manifest)).toEqual([]);
  });
});
