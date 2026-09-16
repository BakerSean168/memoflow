/**
 * Notification RPC map surface spec (Phase 4 transport parity ledger).
 *
 * Enumerates every Notification mutation ledger row and detects missing
 * schema/type references before transport migration. The RPC map must import
 * only the inferred request/response types from `../api` (no inline object
 * types). Protocol-only rows (execute-action, send, retry, channel:list,
 * get-stats) are
 * documented as explicitly unsupported transport surfaces — never silently
 * divergent payloads.
 *
 * 枚举 Notification 全部 mutation ledger 行，并在 transport 迁移前发现缺失的
 * schema/type 引用。RPC map 只能从 `../api` 导入推导出的请求/响应类型，禁止
 * 内联 object type。Protocol-only 行（execute-action/send/retry/channel:list）
 * 记录为显式 unsupported transport surface，绝不静默使用不同 payload。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const protocolDir = __dirname;
const rpcMapFile = resolve(protocolDir, 'notification-rpc-map.ts');
const rpcMap = readFileSync(rpcMapFile, 'utf8');

/**
 * Ledger rows owned by this module. Each mutation must reference a real
 * request schema + response type once contracts are closed. Void rows carry
 * no body (identity-scoped commands).
 */
const NOTIFICATION_LEDGER = [
  ['notification:create', 'CreateNotificationSchema', 'NotificationServerDTO'],
  ['notification:delete', 'void', 'null'],
  ['notification:mark-read', 'void', 'NotificationServerDTO'],
  ['notification:mark-all-read', 'void', 'UnreadCountResponse'],
  ['notification:mark-as-read-batch', 'NotificationIdsBatchSchema', 'BatchOperationResultDTO'],
  ['notification:delete-batch', 'NotificationIdsBatchSchema', 'BatchOperationResultDTO'],
  ['notification:cleanup-old', 'CleanupOldNotificationsSchema', 'BatchOperationResultDTO'],
  [
    'notification-preference:update',
    'UpdateNotificationPreferenceSchema',
    'NotificationPreferenceServerDTO',
  ],
] as const;

/** Protocol-only RPC rows with no transport wiring (explicit unsupported surface). */
const NOTIFICATION_PROTOCOL_ONLY = [
  'notification:get-stats',
  'notification:execute-action',
  'notification:send',
  'notification-channel:retry',
  'notification-channel:list',
] as const;

const API_DTO_FILES = [
  'notification-crud.dto.ts',
  'notification-query.dto.ts',
  'notification-batch.dto.ts',
  'notification-preference.dto.ts',
  'response-schemas.ts',
] as const;

function readApiFile(name: string): string {
  return readFileSync(resolve(protocolDir, `../api/${name}`), 'utf8');
}

describe('notification RPC map surface (Phase 4 ledger)', () => {
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
    const mapBody = rpcMap.split('export type NotificationRpcMap = {')[1] ?? '';
    // Inline `z.object({...})` shapes are forbidden; `z.infer<...>` references
    // to shared api response schemas are allowed (single source of truth).
    expect(mapBody).not.toMatch(/z\.object\(/);
    expect(mapBody).not.toMatch(/=\s*\{\s*[A-Za-z_$]/);
  });

  it('every ledger request schema is exported from the notification api', () => {
    const apiSources = API_DTO_FILES.map(readApiFile).join('\n');
    for (const [, requestSchema] of NOTIFICATION_LEDGER) {
      if (requestSchema === 'void') continue;
      const schemaRegex = new RegExp(`export (const|type) ${requestSchema}\\b`);
      expect(
        apiSources,
        `request schema ${requestSchema} must be exported from notification api`,
      ).toMatch(schemaRegex);
    }
  });

  it('ledger response types resolve to response-schemas or the matching dto', () => {
    const responseSchemas = readApiFile('response-schemas.ts');
    expect(responseSchemas).toContain('export const NotificationResponseSchema');
    expect(responseSchemas).toContain('export const NotificationBatchResultSchema');
    expect(responseSchemas).toContain('export const UnreadCountResponseSchema');
    expect(responseSchemas).toContain('export const NotificationPreferenceResponseSchema');
    expect(readApiFile('notification-batch.dto.ts')).toContain(
      'export const NotificationIdsBatchSchema',
    );
    expect(readApiFile('notification-batch.dto.ts')).toContain('export type MarkAsReadBatchReq');
    expect(readApiFile('notification-batch.dto.ts')).toContain(
      'export type DeleteNotificationsBatchReq',
    );
    expect(readFileSync(resolve(protocolDir, '../dtos/batch-result.dto.ts'), 'utf8')).toContain(
      'export type BatchOperationResultDTO',
    );
  });

  it('protocol-only rows are explicitly listed (no silent divergence)', () => {
    for (const key of NOTIFICATION_PROTOCOL_ONLY) {
      expect(rpcMap, `protocol-only ${key} must stay in the map`).toContain(`'${key}':`);
    }
  });

  it('does not expose an arbitrary Fact update RPC', () => {
    expect(rpcMap).not.toContain("'notification:update':");
    expect(readApiFile('notification-crud.dto.ts')).not.toContain('UpdateNotificationSchema');
  });

  it('imported names are all referenced by the map body (no dead imports)', () => {
    const imported = [...rpcMap.matchAll(/^import type \{([\s\S]*?)\} from /gm)].flatMap((m) =>
      m[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const mapBody = rpcMap.split('export type NotificationRpcMap')[1] ?? '';
    for (const name of imported) {
      expect(mapBody, `imported ${name} must be referenced by NotificationRpcMap`).toContain(name);
    }
  });

  it('every ledger row has a map entry (mutation ledger completeness)', () => {
    const mapBody = rpcMap.split('export type NotificationRpcMap')[1] ?? '';
    for (const [key] of NOTIFICATION_LEDGER) {
      expect(mapBody, `ledger row ${key} must have a NotificationRpcMap entry`).toContain(
        `'${key}':`,
      );
    }
  });
});
