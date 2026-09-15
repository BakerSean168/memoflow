import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 661: empty dual barrel re-exports retired from module roots.
 * Residual note barrels may remain; public module index must not re-export them.
 */
describe('empty dual barrel re-export single-track surface (residual 661)', () => {
  const modules = resolve(__dirname, '..');

  it('account module index does not re-export empty entities/dtos dual barrels', () => {
    const index = readFileSync(resolve(modules, 'account/index.ts'), 'utf8');
    expect(index).toMatch(/Residual 661/);
    expect(index).not.toContain("export * from './entities'");
    expect(index).not.toContain("export * from './dtos'");
    expect(index).toContain("export * from './aggregates'");
    expect(index).toContain("export * from './api'");
  });

  it('schedule keeps its residual empty DTO barrel while Setting deletes the DTO barrel entirely', () => {
    const schedule = readFileSync(resolve(modules, 'schedule/index.ts'), 'utf8');
    const setting = readFileSync(resolve(modules, 'setting/index.ts'), 'utf8');
    expect(schedule).toMatch(/Residual 661/);
    expect(schedule).not.toContain("export * from './dtos'");
    expect(setting).not.toContain("export * from './dtos'");
    expect(schedule).toContain("export * from './api'");
    expect(setting).toContain("export * from './api'");
    expect(setting).toContain("export * from './preferences'");
    expect(existsSync(resolve(modules, 'setting/dtos'))).toBe(false);
  });

  it('keeps residual-empty dual barrels as note-only files', () => {
    const accountDtos = readFileSync(resolve(modules, 'account/dtos/index.ts'), 'utf8');
    const scheduleDtos = readFileSync(resolve(modules, 'schedule/dtos/index.ts'), 'utf8');
    const accountEntities = readFileSync(resolve(modules, 'account/entities/index.ts'), 'utf8');
    expect(accountDtos).toContain('export {}');
    expect(scheduleDtos).toMatch(/Residual 653/);
    expect(accountEntities).toMatch(/Residual 655/);
  });
});
