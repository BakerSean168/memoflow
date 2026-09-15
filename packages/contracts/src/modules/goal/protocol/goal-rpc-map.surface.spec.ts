/**
 * Goal RPC map surface spec (Phase 4 transport parity ledger).
 *
 * Enumerates every Goal mutation ledger row and detects missing schema/type
 * references before transport migration. The RPC map must import only the
 * inferred request/response types from `../api` (no inline object types).
 *
 * 枚举 Goal 全部 mutation ledger 行，并在 transport 迁移前发现缺失的
 * schema/type 引用。RPC map 只能从 `../api` 导入推导出的请求/响应类型，
 * 禁止内联 object type。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const protocolDir = __dirname;
const rpcMapFile = resolve(protocolDir, 'goal-rpc-map.ts');
const rpcMap = readFileSync(rpcMapFile, 'utf8');

/**
 * Ledger rows owned by this module. Each mutation must reference a real
 * request schema + response type once contracts are closed. Void rows carry
 * no body (identity-scoped commands).
 */
const GOAL_LEDGER = [
  ['goal:create', 'CreateGoalSchema', 'GoalMutationReceipt'],
  ['goal:update', 'UpdateGoalSchema', 'GoalMutationReceipt'],
  ['goal:delete', 'GoalVersionCommandSchema', 'GoalMutationReceipt'],
  ['goal:archive', 'GoalVersionCommandSchema', 'GoalMutationReceipt'],
  ['goal:plan', 'GoalVersionCommandSchema', 'GoalMutationReceipt'],
  ['goal:activate', 'GoalVersionCommandSchema', 'GoalMutationReceipt'],
  ['goal:complete', 'GoalVersionCommandSchema', 'GoalMutationReceipt'],
  ['goal:abandon', 'GoalVersionCommandSchema', 'GoalMutationReceipt'],
  ['goal:clone', 'CloneGoalSchema', 'GoalMutationReceipt'],
  ['key-result:add', 'AddKeyResultSchema', 'GoalMutationReceipt'],
  ['key-result:update', 'UpdateKeyResultSchema', 'GoalMutationReceipt'],
  ['key-result:progress', 'UpdateKeyResultProgressSchema', 'GoalMutationReceipt'],
  ['key-result:delete', 'DeleteKeyResultSchema', 'GoalMutationReceipt'],
  ['key-result:batch-weights', 'BatchUpdateKeyResultWeightsReqSchema', 'GoalMutationReceipt'],
  ['goal:review:create', 'CreateGoalReviewSchema', 'GoalMutationReceipt'],
  ['goal:review:update', 'UpdateGoalReviewSchema', 'GoalMutationReceipt'],
  ['goal:review:delete', 'DeleteGoalReviewSchema', 'GoalMutationReceipt'],
  ['goal:record:create', 'CreateGoalRecordSchema', 'GoalMutationReceipt'],
  ['goal:record:delete', 'DeleteGoalRecordSchema', 'GoalMutationReceipt'],
] as const;

/**
 * Every GoalRpcMap tuple, pinned to its canonical request/response types.
 * Runtime textual pin (not `expectTypeOf`) so a wrong or mispositioned tuple
 * fails the gate even though `*.spec.ts` is excluded from the typecheck.
 */
const GOAL_RPC_TUPLES = [
  ['goal:create', 'CreateGoalReq', 'CreateGoalRes'],
  ['goal:update', 'UpdateGoalInvocation', 'GoalMutationReceipt'],
  ['goal:delete', 'DeleteGoalInvocation', 'GoalMutationReceipt'],
  ['goal:archive', 'GoalStatusCommandInvocation', 'GoalMutationReceipt'],
  ['goal:plan', 'GoalStatusCommandInvocation', 'GoalMutationReceipt'],
  ['goal:activate', 'GoalStatusCommandInvocation', 'GoalMutationReceipt'],
  ['goal:complete', 'GoalStatusCommandInvocation', 'GoalMutationReceipt'],
  ['goal:abandon', 'GoalStatusCommandInvocation', 'GoalMutationReceipt'],
  ['goal:clone', 'CloneGoalInvocation', 'GoalMutationReceipt'],
  ['goal:get', 'GetGoalReq', 'GetGoalRes'],
  ['goal:list', 'ListGoalFilters', 'QueryGoalsRes'],
  ['key-result:add', 'AddKeyResultInvocation', 'GoalMutationReceipt'],
  ['key-result:update', 'UpdateKeyResultInvocation', 'GoalMutationReceipt'],
  ['key-result:progress', 'UpdateKeyResultProgressInvocation', 'GoalMutationReceipt'],
  ['key-result:delete', 'DeleteKeyResultInvocation', 'GoalMutationReceipt'],
  ['key-result:batch-weights', 'BatchKeyResultWeightsInvocation', 'GoalMutationReceipt'],
  ['key-result:list', 'GetKeyResultsReq', 'GetKeyResultsRes'],
  ['goal:review:create', 'CreateReviewInvocation', 'GoalMutationReceipt'],
  ['goal:review:update', 'UpdateReviewInvocation', 'GoalMutationReceipt'],
  ['goal:review:delete', 'DeleteReviewInvocation', 'GoalMutationReceipt'],
  ['goal:record:create', 'CreateRecordInvocation', 'GoalMutationReceipt'],
  ['goal:record:delete', 'DeleteRecordInvocation', 'GoalMutationReceipt'],
] as const;

const API_DTO_FILES = [
  'goal-crud.dto.ts',
  'key-result.dto.ts',
  'goal-review.dto.ts',
  'goal-record.dto.ts',
  'response-schemas.ts',
] as const;

function readApiFile(name: string): string {
  return readFileSync(resolve(protocolDir, `../api/${name}`), 'utf8');
}

describe('goal RPC map surface (Phase 4 ledger)', () => {
  it('imports request/response types only from ../api', () => {
    const imports = [...rpcMap.matchAll(/^import type .* from '(\.[^']+)'/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) {
      expect(specifier, `import from '${specifier}'`).toMatch(/^\.\.\/api($|\/)/);
    }
  });

  it('defines no inline object types inside the map body', () => {
    const mapBody = rpcMap.split('export type GoalRpcMap = {')[1] ?? '';
    expect(mapBody).not.toMatch(/=\s*\{/);
    expect(mapBody).not.toMatch(/z\./);
  });

  it('every ledger request schema is exported from the goal api', () => {
    const apiSources = [...API_DTO_FILES.map(readApiFile)].join('\n');
    for (const [, requestSchema] of GOAL_LEDGER) {
      if (requestSchema === 'void') continue;
      const schemaRegex = new RegExp(`export (const|type) ${requestSchema}\\b`);
      expect(apiSources, `request schema ${requestSchema} must be exported from goal api`).toMatch(
        schemaRegex,
      );
    }
  });

  it('ledger response types resolve to the canonical Goal mutation receipt', () => {
    const responseSchemas = readApiFile('response-schemas.ts');
    expect(responseSchemas).toContain('export const GoalMutationReceiptSchema');
    expect(responseSchemas).toContain('export type GoalMutationReceipt =');
    expect(responseSchemas).toContain('export const BatchUpdateKeyResultWeightsReqSchema');
    expect(responseSchemas).not.toContain('ArchiveExpiredResSchema');
    expect(rpcMap).not.toContain('goal-folder:');
    expect(rpcMap).not.toContain('focus:');
    expect(rpcMap).not.toContain('goal:archive-expired');
  });

  it('imported names are all referenced by the map body (no dead imports)', () => {
    const imported = [...rpcMap.matchAll(/^import type \{([^}]+)\} from /gm)].flatMap((m) =>
      m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const mapBody = rpcMap.split('export type GoalRpcMap')[1] ?? '';
    for (const name of imported) {
      expect(mapBody, `imported ${name} must be referenced by GoalRpcMap`).toContain(name);
    }
  });

  it('every ledger row has a map entry (mutation ledger completeness)', () => {
    const mapBody = rpcMap.split('export type GoalRpcMap')[1] ?? '';
    for (const [key] of GOAL_LEDGER) {
      expect(mapBody, `ledger row ${key} must have a GoalRpcMap entry`).toContain(`'${key}':`);
    }
  });

  it('every map tuple matches the canonical request/response types (runtime pin)', () => {
    for (const [key, requestType, responseType] of GOAL_RPC_TUPLES) {
      expect(rpcMap, `map entry '${key}' must be [${requestType}, ${responseType}]`).toMatch(
        new RegExp(`'${key}':\\s*\\[${requestType},\\s*${responseType}\\]`),
      );
    }
  });
});
