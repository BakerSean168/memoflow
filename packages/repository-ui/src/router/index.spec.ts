import { describe, expect, it } from 'vitest';
import { repositoryRoutes } from './index';

describe('repository routes', () => {
  it('does not expose the retired existing-note editor route', () => {
    expect(repositoryRoutes.map((route) => route.path)).toEqual(['/repository']);
    expect(
      repositoryRoutes.some(
        (route) =>
          route.path === '/note/:id' || route.children?.some((child) => child.name === 'note-edit'),
      ),
    ).toBe(false);
  });
});
