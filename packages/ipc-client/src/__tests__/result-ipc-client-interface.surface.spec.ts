import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Residual 266: IResultIpcClient is canonical in @memoflow/ipc-client.
 * Module infrastructure-client adapters re-export it; no local interface duals.
 */
describe('IResultIpcClient single-track surface', () => {
  const types = readFileSync(resolve(__dirname, '../types.ts'), 'utf8');
  const index = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');
  const resultClient = readFileSync(resolve(__dirname, '../result-ipc-client.ts'), 'utf8');

  const dualPackages = [
    'goal',
    'task',
    'schedule',
    'repository',
    'data-portability',
    'notification',
    'account',
    'setting',
    'ai',
  ] as const;

  it('exports canonical IResultIpcClient with invoke + optional getBridge', () => {
    expect(types).toContain('export interface IResultIpcClient');
    expect(types).toContain('invoke<T = unknown>');
    expect(types).toContain('getBridge?:');
    expect(index).toContain('IResultIpcClient');
    expect(resultClient).toContain('implements IResultIpcClient');
  });

  it('module adapters re-export IResultIpcClient from @memoflow/ipc-client only', () => {
    for (const pkg of dualPackages) {
      const path = resolve(
        __dirname,
        `../../../${pkg}/src/infrastructure-client/adapters/types.ts`,
      );
      expect(existsSync(path), path).toBe(true);
      const source = readFileSync(path, 'utf8');
      expect(source, pkg).toContain("export type { IResultIpcClient } from '@memoflow/ipc-client'");
      expect(source, pkg).not.toMatch(/export interface IResultIpcClient\s*\{/);
    }
  });

  it('no package-local export interface IResultIpcClient remains under packages', () => {
    const packagesRoot = resolve(__dirname, '../../..');
    const offenders: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === '.git'
        ) {
          continue;
        }
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
        // Residual 1331: path.relative works on Windows; skip canonical ipc-client sole.
        const rel = relative(packagesRoot, full).split('\\').join('/');
        if (rel.startsWith('ipc-client/')) continue;
        const text = readFileSync(full, 'utf8');
        if (/export interface IResultIpcClient\s*\{/.test(text)) {
          offenders.push(rel);
        }
      }
    }

    walk(packagesRoot);
    expect(offenders).toEqual([]);
  });
});
