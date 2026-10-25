import { afterEach, expect, it, vi } from 'vitest';
import { generateUUID, isValidUUID, newId } from './uuid';

afterEach(() => vi.unstubAllGlobals());

it.each([
  ['newId', newId],
  ['generateUUID', generateUUID],
] as const)('%s allocates distinct valid UUIDs', (_name, allocate) => {
  const first = allocate();
  expect(isValidUUID(first)).toBe(true);
  expect(isValidUUID(allocate())).toBe(true);
  expect(allocate()).not.toBe(first);
});

it('allocates a valid UUID when the host has no native crypto', () => {
  vi.stubGlobal('crypto', undefined);
  expect(isValidUUID(generateUUID())).toBe(true);
});
