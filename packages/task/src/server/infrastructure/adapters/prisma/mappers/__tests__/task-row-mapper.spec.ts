/**
 * Task row mapper surface
 * 任务行 Mapper 表面测试
 *
 * Proves each row mapper preserves enum narrowing and default fallbacks when
 * converting Prisma/PowerSync string columns into the shared contract enums.
 *
 * 证明每个 row mapper 在把 Prisma/PowerSync 字符串列转换为共享 contract enum
 * 时保持 enum 收窄与默认回退。
 */
import { describe, expect, it } from 'vitest';
import { toImportanceLevel } from '../task-row.mapper';
import { ImportanceLevel } from '@memoflow/shared-primitives';

describe('task row mappers', () => {
  it('toImportanceLevel preserves known values', () => {
    expect(toImportanceLevel('Important')).toBe(ImportanceLevel.Important);
    expect(toImportanceLevel('Minor')).toBe(ImportanceLevel.Minor);
  });

  it('toImportanceLevel falls back to Moderate for absent values', () => {
    expect(toImportanceLevel(null)).toBe(ImportanceLevel.Moderate);
    expect(toImportanceLevel('unknown-value')).toBe(ImportanceLevel.Moderate);
  });
});
