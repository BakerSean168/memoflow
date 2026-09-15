import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function cloudAuthUserModel(): string {
  const schema = readFileSync(resolve(__dirname, '../../prisma/schema/auth.prisma'), 'utf8');
  return schema.match(/model CloudAuthUser\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
}

describe('CloudAuthUser access projection Prisma schema', () => {
  it('maps disabledAt to disabled_at and does not resurrect a status column', () => {
    const model = cloudAuthUserModel();

    expect(model).toContain('disabledAt');
    expect(model).toContain('@map("disabled_at")');
    expect(model).toContain('@@map("cloud_auth_users")');
    expect(model).not.toMatch(/^\s*status\s+/m);
  });
});
