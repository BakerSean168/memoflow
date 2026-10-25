import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
// Side-effect import kept intentionally: it carries the `declare module 'zod'`
// augmentation that adds `.openapi()` to ZodType. Declaration emit elides the
// named import above (only used in a statement), which would leave dist-mode
// consumers of this package without the `.openapi()` typing.
import '@asteasolutions/zod-to-openapi';

// Extend Zod with .openapi() method — must run before any schema that uses .openapi()
extendZodWithOpenApi(z);

/**
 * OpenAPI-friendly schema for unknown/any JSON values.
 * Use this instead of raw z.unknown() inside z.record() or other composite types,
 * so that zod-to-openapi can generate a valid OpenAPI document.
 */
export const openApiJsonValue = z.unknown().openapi({ type: 'object' });

// ============================================================================
// Prefixed ID Validation
// ============================================================================

/**
 * UUID v4 pattern (case-insensitive)
 */
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * 通用前缀式 ID 正则：匹配 `Prefix_UUID` 格式。
 * 同时兼容纯 UUID（向后兼容）。
 *
 * 合法示例：
 * - IdentityId_7e92ca52-b331-4cbb-9ecc-2b1f1471c370
 * - IGoalId_550e8400-e29b-41d4-a716-446655440000
 * - 7e92ca52-b331-4cbb-9ecc-2b1f1471c370 (纯 UUID，向后兼容)
 */
const GENERIC_PREFIXED_ID_REGEX = new RegExp(`^(?:[A-Za-z][A-Za-z0-9]*_)?${UUID_PATTERN}$`, 'i');

/**
 * 构建特定前缀的 ID 正则
 */
function buildPrefixedIdRegex(prefix: string): RegExp {
  return new RegExp(`^${prefix}_${UUID_PATTERN}$`, 'i');
}

/**
 * Creates a Zod schema for a branded ID type.
 *
 * 支持两种使用方式：
 *
 * 1. 无前缀参数 — 接受任意 `Prefix_UUID` 或纯 UUID 格式：
 * ```ts
 * identityId: brandedId<IdentityId>(),
 * ```
 *
 * 2. 指定前缀 — 严格校验 `{prefix}_{UUID}` 格式：
 * ```ts
 * import { ID_PREFIXES } from './ids';
 * identityId: brandedId<IdentityId>(ID_PREFIXES.IdentityId),
 * // 仅接受 IdentityId_xxxx-xxxx-xxxx-xxxx
 * ```
 *
 * @param prefixOrMessage - 可选的前缀字符串或自定义错误消息。
 *   如果值匹配已知前缀模式（首字母大写+字母数字），则视为前缀；
 *   否则视为错误消息（向后兼容）。
 */
export const brandedId = <T extends string>(prefixOrMessage?: string) => {
  // 判断是否为前缀：以大写字母开头，只包含字母和数字
  const isPrefix = prefixOrMessage && /^[A-Z][A-Za-z0-9]*$/.test(prefixOrMessage);

  if (isPrefix) {
    const regex = buildPrefixedIdRegex(prefixOrMessage!);
    return z
      .string()
      .regex(regex, `Invalid ${prefixOrMessage} ID format`) as unknown as z.ZodType<T>;
  }

  // 默认：接受任意前缀式 ID 或纯 UUID
  return z
    .string()
    .regex(
      GENERIC_PREFIXED_ID_REGEX,
      prefixOrMessage ?? 'Invalid ID format',
    ) as unknown as z.ZodType<T>;
};
