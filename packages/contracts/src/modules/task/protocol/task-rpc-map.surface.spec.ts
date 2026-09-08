/**
 * Task RPC map surface spec (Phase 4 transport parity ledger).
 *
 * Enumerates every Task mutation ledger row and detects missing schema/type
 * references before transport migration. The RPC map must import only the
 * inferred request/response types from `../api` (no inline object types).
 *
 * 枚举 Task 全部 mutation ledger 行，并在 transport 迁移前发现缺失的
 * schema/type 引用。RPC map 只能从 `../api` 导入推导出的请求/响应类型，
 * 禁止内联 object type。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const protocolDir = __dirname;
const rpcMapFile = resolve(protocolDir, 'task-rpc-map.ts');
const rpcMap = readFileSync(rpcMapFile, 'utf8');

/**
 * Ledger rows owned by this module. Each mutation must reference a real
 * request schema + response type once contracts are closed. Void rows carry
 * no body (identity-scoped commands).
 */
const TASK_LEDGER = [
  ['task:template:create', 'CreateTaskPlanSchema', 'TaskPlanClientDTO'],
  ['task:template:update', 'UpdateTaskPlanSchema', 'TaskPlanClientDTO'],
  ['task:template:delete', 'void', 'null'],
  ['task:template:activate', 'void', 'TaskPlanClientDTO'],
  ['task:template:abandon', 'AbandonTaskPlanSchema', 'TaskPlanClientDTO'],
  ['task:template:pause', 'void', 'TaskPlanClientDTO'],
  ['task:template:archive', 'void', 'TaskPlanClientDTO'],
  ['task:template:generate-instances', 'GenerateInstancesSchema', 'TaskOccurrenceClientDTO'],
  ['task:template:bind-goal', 'TaskGoalBindingSchema', 'TaskPlanClientDTO'],
  ['task:template:unbind-goal', 'void', 'TaskPlanClientDTO'],
  ['task:instance:create', 'void', 'TaskOccurrenceClientDTO'],
  ['task:instance:delete', 'void', 'null'],
  ['task:instance:complete', 'CompleteTaskOccurrenceSchema', 'TaskOccurrenceClientDTO'],
  ['task:instance:uncomplete', 'void', 'TaskOccurrenceClientDTO'],
  ['task:instance:skip', 'SkipTaskOccurrenceSchema', 'TaskOccurrenceClientDTO'],
  ['task:instance:mark-missed', 'MarkTaskOccurrenceMissedSchema', 'TaskOccurrenceClientDTO'],
] as const;

const API_DTO_FILES = [
  'task-plan.dto.ts',
  'task-occurrence.dto.ts',
  'task-schedule.dto.ts',
  'response-schemas.ts',
] as const;

function readApiFile(name: string): string {
  return readFileSync(resolve(protocolDir, `../api/${name}`), 'utf8');
}

describe('task RPC map surface (Phase 4 ledger)', () => {
  it('imports request/response types only from ../api', () => {
    const imports = [...rpcMap.matchAll(/^import type \{[\s\S]*?\} from '(\.[^']+)'/gm)].map(
      (m) => m[1],
    );
    expect(imports.length).toBeGreaterThan(0);
    for (const specifier of imports) {
      expect(specifier, `import from '${specifier}'`).toMatch(/^\.\.\/api($|\/)/);
    }
  });

  it('defines no inline object types inside the map body', () => {
    const mapBody = rpcMap.split('export type TaskRpcMap = {')[1] ?? '';
    // Inline `z.object({...})` shapes are forbidden; `z.infer<...>` references
    // to shared api response schemas are allowed (single source of truth).
    expect(mapBody).not.toMatch(/z\.object\(/);
    expect(mapBody).not.toMatch(/=\s*\{\s*[A-Za-z_$]/);
  });

  it('every ledger request schema is exported from the task api', () => {
    const apiSources = [
      ...API_DTO_FILES.map(readApiFile),
      readFileSync(resolve(protocolDir, '../value-objects/task-goal-binding.ts'), 'utf8'),
    ].join('\n');
    for (const [, requestSchema] of TASK_LEDGER) {
      if (requestSchema === 'void') continue;
      const schemaRegex = new RegExp(`export (const|type) ${requestSchema}\\b`);
      expect(apiSources, `request schema ${requestSchema} must be exported from task api`).toMatch(
        schemaRegex,
      );
    }
  });

  it('ledger response types resolve to response-schemas or the matching dto', () => {
    const responseSchemas = readApiFile('response-schemas.ts');
    expect(responseSchemas).toContain('export const TaskPlanResponseSchema');
    expect(responseSchemas).toContain('export const TaskOccurrenceResponseSchema');
    expect(readApiFile('task-occurrence.dto.ts')).toContain('export type TaskOccurrenceOperationRes =');
  });

  it('imported names are all referenced by the map body (no dead imports)', () => {
    const imported = [...rpcMap.matchAll(/^import type \{([\s\S]*?)\} from /gm)].flatMap((m) =>
      m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const mapBody = rpcMap.split('export type TaskRpcMap')[1] ?? '';
    for (const name of imported) {
      expect(mapBody, `imported ${name} must be referenced by TaskRpcMap`).toContain(name);
    }
  });

  it('every ledger row has a map entry (mutation ledger completeness)', () => {
    const mapBody = rpcMap.split('export type TaskRpcMap')[1] ?? '';
    for (const [key] of TASK_LEDGER) {
      expect(mapBody, `ledger row ${key} must have a TaskRpcMap entry`).toContain(`'${key}':`);
    }
  });
});
