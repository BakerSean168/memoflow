import { describe, expect, it } from 'vitest';
import { CreateScopedPatSchema, ScopedPatSummarySchema } from './index';

describe('scoped PAT lifetime contract (#970)', () => {
  it('defaults issuance to 90 days when the caller omits expiresInDays', () => {
    expect(CreateScopedPatSchema.parse({ name: 'agent' }).expiresInDays).toBe(90);
  });

  it('accepts a full year and rejects a day longer', () => {
    expect(CreateScopedPatSchema.parse({ name: 'agent', expiresInDays: 365 }).expiresInDays).toBe(
      365,
    );
    expect(CreateScopedPatSchema.safeParse({ name: 'agent', expiresInDays: 366 }).success).toBe(
      false,
    );
    expect(CreateScopedPatSchema.safeParse({ name: 'agent', expiresInDays: 0 }).success).toBe(
      false,
    );
    expect(CreateScopedPatSchema.safeParse({ name: 'agent', expiresInDays: 1.5 }).success).toBe(
      false,
    );
  });

  it('echoes the granted expiry and scopes in the credential summary', () => {
    const summary = {
      id: '5b5d8a2b-9934-4be8-8e07-3f62ed122e15',
      name: 'yearly agent',
      prefix: 'mfp_AbCdEfG',
      audience: 'https://api.memo.test/mcp',
      scopes: [
        'goals:read',
        'goals:write',
        'tasks:read',
        'tasks:write',
        'routines:write',
        'ai:read',
        'routines:read',
      ],
      createdAt: '2026-11-16T00:00:00.000Z',
      expiresAt: '2027-11-16T00:00:00.000Z',
      revokedAt: null,
    };
    expect(ScopedPatSummarySchema.parse(summary)).toEqual(summary);
  });

  it('grants notification scopes within the raised nine-scope ceiling (#990)', () => {
    const scopes = [
      'goals:read',
      'goals:write',
      'tasks:read',
      'tasks:write',
      'routines:write',
      'ai:read',
      'routines:read',
      'notifications:read',
      'notifications:write',
    ];
    expect(CreateScopedPatSchema.parse({ name: 'agent', scopes }).scopes).toEqual(scopes);
    expect(
      CreateScopedPatSchema.safeParse({ name: 'agent', scopes: [...scopes, 'goals:read'] }).success,
    ).toBe(false);
    expect(
      CreateScopedPatSchema.safeParse({ name: 'agent', scopes: ['notifications:admin'] }).success,
    ).toBe(false);
    const summary = {
      id: '5b5d8a2b-9934-4be8-8e07-3f62ed122e15',
      name: 'notifications agent',
      prefix: 'mfp_AbCdEfG',
      audience: 'https://api.memo.test/mcp',
      scopes: ['notifications:read', 'notifications:write'],
      createdAt: '2026-11-16T00:00:00.000Z',
      expiresAt: '2027-11-16T00:00:00.000Z',
      revokedAt: null,
    };
    expect(ScopedPatSummarySchema.parse(summary)).toEqual(summary);
  });

  it('accepts ai:read and rejects a seventh scope', () => {
    const six = CreateScopedPatSchema.parse({
      name: 'ai reader',
      scopes: [
        'goals:read',
        'tasks:read',
        'goals:write',
        'tasks:write',
        'routines:write',
        'ai:read',
      ],
    });
    expect(six.scopes).toContain('ai:read');
    expect(
      CreateScopedPatSchema.safeParse({
        name: 'too many',
        scopes: [
          'goals:read',
          'tasks:read',
          'goals:write',
          'tasks:write',
          'routines:write',
          'ai:read',
          'ai:read',
        ],
      }).success,
    ).toBe(false);
  });
});
