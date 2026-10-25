import { createMemoryHistory } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from './index';

describe('createAppRouter', () => {
  it('mounts the AI Agent Workspace at the root route', () => {
    const router = createAppRouter({
      history: createMemoryHistory(),
      canAccessApp: () => true,
    });

    const route = router.resolve('/');

    expect(route.name).toBe('ai-workspace');
    expect(route.meta.title).toBe('aiAssistant.chatPage.title');
  });

  it('redirects the legacy /ai/chat entry to the AI workspace root', async () => {
    const router = createAppRouter({
      history: createMemoryHistory(),
      canAccessApp: () => true,
    });

    await router.push('/ai/chat');

    expect(router.currentRoute.value.name).toBe('ai-workspace');
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('defaults the /auth route to the platform AuthApp entry (not in-shell guest AuthView)', async () => {
    const router = createAppRouter({
      history: createMemoryHistory(),
      canAccessApp: () => false,
    });

    const route = router.getRoutes().find((item) => item.path === '/auth');
    expect(route).toBeTruthy();
    // Lazy component resolves to AuthPlatformEntry for web main shell.
    const loader = route?.components?.default as
      (() => Promise<{ default: { name?: string; __name?: string } }>) | undefined;
    expect(typeof loader).toBe('function');
    const mod = await loader!();
    const name = mod.default.name ?? mod.default.__name ?? '';
    expect(name).toMatch(/AuthPlatformEntry/i);
  });
});
