import { describe, expect, it } from 'vitest';
import {
  parseExplicitProductDateInput,
  parsedProductDateStartYmd,
} from './parse-explicit-product-date';

describe('parseExplicitProductDateInput', () => {
  it.each([
    ['2027-05-20', { kind: 'day', date: '2027-05-20' }],
    ['2027/05/20', { kind: 'day', date: '2027-05-20' }],
    ['May 2027', { kind: 'month', year: 2027, month: 5 }],
    ['2027 May', { kind: 'month', year: 2027, month: 5 }],
    ['Q4 2027', { kind: 'quarter', year: 2027, quarter: 4 }],
    ['2027 Q4', { kind: 'quarter', year: 2027, quarter: 4 }],
    ['2027', { kind: 'year', year: 2027 }],
    ['2027年5月', { kind: 'month', year: 2027, month: 5 }],
    ['2027年Q4', { kind: 'quarter', year: 2027, quarter: 4 }],
    ['2027年', { kind: 'year', year: 2027 }],
  ])('parses %s', (input, expected) => {
    expect(parseExplicitProductDateInput(input)).toEqual(expected);
  });

  it('rejects invalid calendar dates instead of rolling them forward', () => {
    expect(parseExplicitProductDateInput('2027-02-30')).toBeNull();
  });

  it('projects coarse explicit input onto its deterministic start boundary when an exact day is required', () => {
    const parsed = parseExplicitProductDateInput('Q4 2027');
    expect(parsed && parsedProductDateStartYmd(parsed)).toBe('2027-10-01');
  });
});
