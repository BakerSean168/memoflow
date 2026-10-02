import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

describe('GOV-7902 reference-policy proposal activation gate', () => {
  it('retains active Governance-first policy while ADR-113 is Proposed', () => {
    expect(read('AGENT.md')).toContain('必须先把 `packages/governance` 作为最先的试点模块');
    expect(
      read(
        'docs/architecture/adr/ADR-113-retire-product-governance-runtime-keep-engineering-governance.md',
      ),
    ).toContain('**状态：** 提议（待最终确认）');
    const gate = JSON.parse(
      read('tools/governance/product-governance-retirement-inventory.json'),
    ).decisionGate;
    expect(gate).toEqual({ adr: 'ADR-113', status: 'Proposed', destructiveAllowed: false });
  });

  it('keeps real-owner replacement acceptance tests proposed and inactive', () => {
    const proposal = read(
      'docs/plan/active/2026-10-02-pvc-gov-7902-engineering-governance-input-decoupling.md',
    );
    expect(proposal).toContain('Activation requires accepted ADR-113');
    expect(proposal).toContain('characterization tests');
    expect(proposal).toContain('second real owner');
    expect(read('tools/governance/__tests__/governance-reference-preservation.test.mjs')).toContain(
      'physically present',
    );
  });
});
