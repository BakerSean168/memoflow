import { expect, it } from 'vitest';
import { normalizeOrigin } from '../../e2e/helpers/normalize-origin';

it('removes trailing slashes without changing the origin or path', () => {
  for (const [input, expected] of [
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://localhost:3000/', 'http://localhost:3000'],
    ['http://localhost:3000///', 'http://localhost:3000'],
    ['https://example.com/api/', 'https://example.com/api'],
  ]) expect(normalizeOrigin(input)).toBe(expected);
});
