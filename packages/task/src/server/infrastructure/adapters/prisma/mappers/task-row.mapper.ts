/**
 * Task Row Mappers
 * 任务行 Mapper
 *
 * Named boundary mappers for Prisma/PowerSync row → domain conversions that
 * narrow string columns into shared contract enum types. Each mapper is
 * the single typed conversion point so the boundary never leaks `as unknown as`
 * casts into transport/domain code.
 *
 * Prisma/PowerSync 行 → domain 转换的命名边界 mapper：把字符串列收窄为共享
 * contract enum 类型。每个 mapper 是唯一类型转换点，使边界不会向
 * transport/domain 泄漏 `as unknown as` 强转。
 */

import { ImportanceLevel } from '@memoflow/shared-primitives';

const IMPORTANCE_LEVEL_VALUES = Object.values(ImportanceLevel);

/**
 * Narrow a raw Prisma/PowerSync importance string into the contract
 * `ImportanceLevel`. Falls back to `'Moderate'` for unknown/absent values.
 * 把原始 Prisma/PowerSync importance 字符串收窄为 contract `ImportanceLevel`；
 * 未知/缺失值回退到 `'Moderate'`。
 */
export function toImportanceLevel(value: string | null | undefined): ImportanceLevel {
  if (value && (IMPORTANCE_LEVEL_VALUES as string[]).includes(value)) {
    return value as ImportanceLevel;
  }
  return ImportanceLevel.Moderate;
}
