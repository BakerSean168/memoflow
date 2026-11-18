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

  it('accepts an optional idempotency key and still rejects unknown fields', () => {
    expect(
      CreateScopedPatSchema.parse({ name: 'agent', idempotencyKey: 'web-click-1' }).idempotencyKey,
    ).toBe('web-click-1');
    expect(CreateScopedPatSchema.parse({ name: 'agent' }).idempotencyKey).toBeUndefined();
    expect(
      CreateScopedPatSchema.safeParse({ name: 'agent', idempotencyKey: 'x'.repeat(201) }).success,
    ).toBe(false);
    expect(CreateScopedPatSchema.safeParse({ name: 'agent', idempotencyKey: '   ' }).success).toBe(
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
        'labels:read',
      ],
      createdAt: '2026-11-16T00:00:00.000Z',
      expiresAt: '2027-11-16T00:00:00.000Z',
      revokedAt: null,
    };
    expect(ScopedPatSummarySchema.parse(summary)).toEqual(summary);
  });

  it('grants notification and schedule read scopes within the raised twelve-scope ceiling (#990/#995)', () => {
    const scopes = [
      'goals:read',
      'goals:write',
      'tasks:read',
      'tasks:write',
      'routines:write',
      'ai:read',
      'routines:read',
      'notifications:read',
      'schedules:read',
      'notifications:write',
      'labels:read',
      'relations:read',
    ];
    expect(CreateScopedPatSchema.parse({ name: 'agent', scopes }).scopes).toEqual(scopes);
    expect(
      CreateScopedPatSchema.safeParse({ name: 'agent', scopes: [...scopes, 'goals:read'] }).success,
    ).toBe(false);
    expect(
      CreateScopedPatSchema.safeParse({ name: 'agent', scopes: ['schedules:write'] }).success,
    ).toBe(false);
    expect(
      CreateScopedPatSchema.safeParse({ name: 'agent', scopes: ['notifications:admin'] }).success,
    ).toBe(false);
    const summary = {
      id: '5b5d8a2b-9934-4be8-8e07-3f62ed122e15',
      name: 'domain reader',
      prefix: 'mfp_AbCdEfG',
      audience: 'https://api.memo.test/mcp',
      scopes: ['notifications:read', 'schedules:read'],
      createdAt: '2026-11-16T00:00:00.000Z',
      expiresAt: '2027-11-16T00:00:00.000Z',
      revokedAt: null,
    };
    expect(ScopedPatSummarySchema.parse(summary)).toEqual(summary);
  });

  it('accepts ai:read and rejects a duplicate scope', () => {
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

  it('accepts labels:read within the ten-scope ceiling (#993)', () => {
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
      'labels:read',
    ];
    expect(CreateScopedPatSchema.parse({ name: 'label agent', scopes }).scopes).toEqual(scopes);
    expect(
      CreateScopedPatSchema.safeParse({ name: 'agent', scopes: [...scopes, 'goals:read'] }).success,
    ).toBe(false);
    expect(
      CreateScopedPatSchema.safeParse({ name: 'agent', scopes: ['labels:write'] }).success,
    ).toBe(false);
  });

  it('accepts relations:read within the eleven-scope ceiling (#994)', () => {
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
      'labels:read',
      'relations:read',
    ];
    expect(CreateScopedPatSchema.parse({ name: 'relation agent', scopes }).scopes).toEqual(scopes);
    expect(
      CreateScopedPatSchema.safeParse({ name: 'agent', scopes: [...scopes, 'goals:read'] }).success,
    ).toBe(false);
    expect(
      CreateScopedPatSchema.safeParse({ name: 'agent', scopes: ['relations:write'] }).success,
    ).toBe(false);
  });
});
