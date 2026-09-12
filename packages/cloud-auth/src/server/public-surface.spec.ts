import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cloud-auth public boundary', () => {
  it('exports only the product session capability from the server barrel', () => {
    const barrel = readFileSync(resolve(import.meta.dirname, 'index.ts'), 'utf8');
    const implementation = readFileSync(resolve(import.meta.dirname, 'cloud-auth.ts'), 'utf8');

    expect(barrel).toContain('CloudSessionCapability');
    expect(implementation).toContain('export interface CloudPrincipal');
    expect(implementation).toContain('export interface CloudSessionCapability');
    expect(implementation).not.toContain('export interface CloudAuthOptions');
    expect(implementation).not.toContain('export interface CloudUserProvisioner');
    expect(implementation).not.toContain('export interface CloudAuth');
    expect(barrel).not.toContain('CloudAuthOptions');
    expect(barrel).not.toContain('CloudUserProvisioner');
  });

  it('keeps request access policy limited to closure enforcement', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'cloud-auth.ts'), 'utf8');

    expect(source).toContain('isClosureBlocked');
    expect(source).not.toContain('USER_ALREADY_EXISTS');
    expect(source).not.toContain('/sign-up/email');
  });
});
