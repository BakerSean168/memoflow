import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeEngineeringRuleHash,
  ENGINEERING_RULE_PINS,
  ENGINEERING_RULE_SOURCE,
  loadEngineeringRuleSource,
  validateEngineeringRuleSource,
} from '../lib/engineering-rule-source.mjs';

const ROOT = path.join(import.meta.dirname, '../../..');
const source = JSON.parse(readFileSync(path.join(ROOT, ENGINEERING_RULE_SOURCE), 'utf8'));
const pins = JSON.parse(readFileSync(path.join(ROOT, ENGINEERING_RULE_PINS), 'utf8'));

function withRepository(run) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'gov7902-source-'));
  const root = path.join(temp, 'repo');
  mkdirSync(path.join(root, 'tools/governance'), { recursive: true });
  const write = (file, value) => writeFileSync(path.join(root, file), JSON.stringify(value));
  write(ENGINEERING_RULE_SOURCE, source);
  write(ENGINEERING_RULE_PINS, pins);
  try {
    run({ root, temp, write });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reverseObjectKeys(item)]),
    );
  return value;
}

describe('native Engineering source validation', () => {
  it('hashes canonical rules and adapters deterministically, independent of object key order', () => {
    // Independent canonical serializer anchors the hash payload, including adapters.
    const canonical = (value) =>
      Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, canonical(value[key])]),
            )
          : value;
    const expected = `sha256:${createHash('sha256')
      .update(JSON.stringify(canonical(source)))
      .digest('hex')}`;
    expect(computeEngineeringRuleHash(source)).toBe(expected);
    expect(computeEngineeringRuleHash(reverseObjectKeys(source))).toBe(expected);
    expect(loadEngineeringRuleSource({ root: ROOT }).semanticHash).toBe(expected);
    for (const mutate of [
      (value) => {
        value.rules[0].description += ' changed';
      },
      (value) => {
        value.adapters[0].description += ' changed';
      },
      (value) => {
        value.adapters[0].proposal.suggestedActions.push('Review ownership.');
      },
    ]) {
      const changed = structuredClone(source);
      mutate(changed);
      expect(computeEngineeringRuleHash(changed)).not.toBe(expected);
      expect(() => validateEngineeringRuleSource(changed, expected)).toThrow(
        /pinned hash mismatch/,
      );
    }
  });

  it.each([
    [
      'extra source field',
      (s) => {
        s.semanticHash = 'embedded';
      },
      /requires exactly/,
    ],
    [
      'wrong kind',
      (s) => {
        s.kind = 'memoflow.governance-rule-bundle';
      },
      /Unsupported/,
    ],
    [
      'wrong version',
      (s) => {
        s.schemaVersion = 2;
      },
      /Unsupported/,
    ],
    [
      'empty rules',
      (s) => {
        s.rules = [];
      },
      /non-empty array/,
    ],
    [
      'non-array rules',
      (s) => {
        s.rules = {};
      },
      /non-empty array/,
    ],
    [
      'missing field',
      (s) => {
        delete s.rules[0].title;
      },
      /requires exactly/,
    ],
    [
      'Product provenance',
      (s) => {
        s.rules[0].provenance = {};
      },
      /requires exactly/,
    ],
    [
      'empty title',
      (s) => {
        s.rules[0].title = ' ';
      },
      /non-empty text/,
    ],
    [
      'invalid code',
      (s) => {
        s.rules[0].code = 'invalid';
      },
      /Invalid engineering code/,
    ],
    [
      'invalid severity',
      (s) => {
        s.rules[0].severity = 'Critical';
      },
      /severity/,
    ],
    [
      'rule ordering',
      (s) => {
        s.rules.reverse();
      },
      /sorted order/,
    ],
    [
      'duplicate rule',
      (s) => {
        s.rules.splice(1, 0, structuredClone(s.rules[0]));
      },
      /unique/,
    ],
    [
      'tag ordering',
      (s) => {
        s.rules[0].tags.reverse();
      },
      /sorted order/,
    ],
    [
      'duplicate tag',
      (s) => {
        s.rules[0].tags.splice(1, 0, s.rules[0].tags[0]);
      },
      /unique/,
    ],
    [
      'malformed tags',
      (s) => {
        s.rules[0].tags = 'ddd';
      },
      /array/,
    ],
    [
      'malformed examples',
      (s) => {
        s.rules[0].goodExamples = {};
      },
      /array/,
    ],
    [
      'extra example field',
      (s) => {
        s.rules[0].goodExamples[0].extra = true;
      },
      /requires exactly/,
    ],
    [
      'wrong example type',
      (s) => {
        s.rules[0].goodExamples[0].type = 'BadExample';
      },
      /type/,
    ],
    [
      'malformed adapters',
      (s) => {
        s.adapters = {};
      },
      /array/,
    ],
    [
      'extra adapter field',
      (s) => {
        s.adapters[0].command = 'echo';
      },
      /requires exactly/,
    ],
    [
      'unknown rule mapping',
      (s) => {
        s.adapters[0].ruleKey = 'DDD-999';
      },
      /reference rules/,
    ],
    [
      'duplicate mapping',
      (s) => {
        s.adapters.push(structuredClone(s.adapters[0]));
      },
      /unique sorted order/,
    ],
    [
      'nonallowlisted rule',
      (s) => {
        s.adapters[0].ruleKey = 'DDD-001';
      },
      /mapping contract/,
    ],
    [
      'nonallowlisted adapter',
      (s) => {
        s.adapters[0].adapterId = 'arbitrary';
      },
      /mapping contract/,
    ],
    [
      'nonallowlisted script',
      (s) => {
        s.adapters[0].checkScript = 'tools/governance/arbitrary-audit.mjs';
      },
      /mapping contract/,
    ],
    [
      'full coverage',
      (s) => {
        s.adapters[0].coverage = 'full';
      },
      /mapping contract/,
    ],
    [
      'mutating proposal',
      (s) => {
        s.adapters[0].proposal.kind = 'apply';
      },
      /require review/,
    ],
    [
      'extra proposal field',
      (s) => {
        s.adapters[0].proposal.directMutation = true;
      },
      /requires exactly/,
    ],
    [
      'empty proposal actions',
      (s) => {
        s.adapters[0].proposal.suggestedActions = [];
      },
      /non-empty array/,
    ],
    [
      'reference traversal',
      (s) => {
        s.rules[0].referencePath = '../outside.ts';
      },
      /without escapes/,
    ],
  ])('rejects %s', (_label, mutate, error) => {
    const invalid = structuredClone(source);
    mutate(invalid);
    expect(() => validateEngineeringRuleSource(invalid)).toThrow(error);
  });

  it.each([
    [
      'wrong pin',
      (p) => {
        p.sources[0].semanticHash = `sha256:${'0'.repeat(64)}`;
      },
      /pinned hash mismatch/,
    ],
    [
      'malformed hash',
      (p) => {
        p.sources[0].semanticHash = 'sha256:bad';
      },
      /Invalid engineering pin hash/,
    ],
    [
      'unregistered source',
      (p) => {
        p.sources[0].path = 'tools/governance/other.json';
      },
      /not repository-pinned/,
    ],
    [
      'duplicate pin',
      (p) => {
        p.sources.push(structuredClone(p.sources[0]));
      },
      /Duplicate/,
    ],
    [
      'extra pins field',
      (p) => {
        p.extra = true;
      },
      /requires exactly/,
    ],
    [
      'extra pin field',
      (p) => {
        p.sources[0].extra = true;
      },
      /requires exactly/,
    ],
    [
      'wrong pins version',
      (p) => {
        p.schemaVersion = 2;
      },
      /Unsupported/,
    ],
    [
      'empty pins',
      (p) => {
        p.sources = [];
      },
      /Unsupported/,
    ],
    [
      'pin traversal',
      (p) => {
        p.sources[0].path = '../outside.json';
      },
      /without escapes/,
    ],
  ])('loader rejects %s', (_label, mutate, error) =>
    withRepository(({ root, write }) => {
      const invalid = structuredClone(pins);
      mutate(invalid);
      write(ENGINEERING_RULE_PINS, invalid);
      expect(() => loadEngineeringRuleSource({ root })).toThrow(error);
    }),
  );

  it.each([ENGINEERING_RULE_SOURCE, ENGINEERING_RULE_PINS])(
    'rejects malformed JSON in %s',
    (file) =>
      withRepository(({ root }) => {
        writeFileSync(path.join(root, file), '{');
        expect(() => loadEngineeringRuleSource({ root })).toThrow(SyntaxError);
      }),
  );

  it.each(['../outside.json', '/tmp/outside.json', 'tools/../outside.json', 'tools\\outside.json'])(
    'rejects source path escape %s',
    (sourcePath) =>
      withRepository(({ root }) => {
        expect(() => loadEngineeringRuleSource({ root, sourcePath })).toThrow(/without escapes/);
      }),
  );

  it.each([ENGINEERING_RULE_SOURCE, ENGINEERING_RULE_PINS])(
    'rejects symlink escape through %s',
    (file) =>
      withRepository(({ root, temp }) => {
        const outside = path.join(temp, 'outside.json');
        writeFileSync(outside, readFileSync(path.join(root, file)));
        rmSync(path.join(root, file));
        symlinkSync(outside, path.join(root, file));
        expect(() => loadEngineeringRuleSource({ root })).toThrow(/escapes repository/);
      }),
  );

  it('rejects a directory as a source', () =>
    withRepository(({ root }) => {
      rmSync(path.join(root, ENGINEERING_RULE_SOURCE));
      mkdirSync(path.join(root, ENGINEERING_RULE_SOURCE));
      expect(() => loadEngineeringRuleSource({ root })).toThrow(/not a file/);
    }));
});
