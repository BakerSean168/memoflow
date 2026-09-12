import { describe, expect, it, vi } from 'vitest';
import type { IResultHttpClient } from '@memoflow/http-client';
import type { IResultIpcClient } from '@memoflow/ipc-client';
import { ok } from '@memoflow/contracts/result';
import { GovernanceChannels } from '@memoflow/contracts/governance';
import { createGovernanceHttpClient, createGovernanceIpcClient } from './index';

const bundle = {
  kind: 'memoflow.governance-rule-bundle' as const,
  schemaVersion: 1 as const,
  hashAlgorithm: 'sha256' as const,
  semanticHash: `sha256:${'1'.repeat(64)}`,
  rules: [],
};

describe('Governance rule-bundle client transport parity (GOV-1903)', () => {
  it('uses the explicit HTTP bundle export endpoint without a live-DB client shortcut', async () => {
    const get = vi.fn(async () => ok(bundle));
    const http = { get } as unknown as IResultHttpClient;

    const result = await createGovernanceHttpClient(http).exportRuleBundle();

    expect(result).toEqual(ok(bundle));
    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith('/governance/rules/bundle');
  });

  it('uses the canonical IPC bundle export channel and returns the same bundle contract', async () => {
    const invoke = vi.fn(async () => ok(bundle));
    const ipc = { invoke } as unknown as IResultIpcClient;

    const result = await createGovernanceIpcClient(ipc).exportRuleBundle();

    expect(result).toEqual(ok(bundle));
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith(GovernanceChannels.RULE_BUNDLE_EXPORT, {});
  });
});
