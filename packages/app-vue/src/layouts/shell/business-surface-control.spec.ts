import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppShellStore } from './useAppShellStore';

describe('BusinessSurface exclusive control', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('checks owner/version and prevents user workspace mutation until release', () => {
    const store = useAppShellStore();
    const { tabId } = store.openTab({
      module: 'goal',
      route: '/goals?goalForm=create',
      title: 'Goal',
      intent: 'deeplink',
    });
    const version = store.claimBusinessControl('run-1', '/goals?goalForm=create');
    expect(() => store.claimBusinessControl('run-2', '/goals?goalForm=create')).toThrow();
    store.showHome();
    store.closeTab(tabId);
    store.closeAllTabs();
    store.closeRightPanel();
    expect(store.activeTabId).toBe(tabId);
    expect(store.panelSurface).toBe('business');
    expect(store.rightPanelOpen).toBe(true);
    expect(store.releaseBusinessControl('run-2', version)).toBe(false);
    expect(store.releaseBusinessControl('run-1', version + 1)).toBe(false);
    expect(store.releaseBusinessControl('run-1', version)).toBe(true);
    store.showHome();
    expect(store.panelSurface).toBe('home');
  });
  it('refuses dirty, busy, or inactive surfaces and does not persist a lock', () => {
    const store = useAppShellStore();
    expect(() => store.claimBusinessControl('run', '/goals')).toThrow();
    store.openTab({ module: 'goal', route: '/goals', title: 'Goal', intent: 'deeplink' });
    store.setSurfaceStatus('dirty');
    expect(() => store.claimBusinessControl('run', '/goals')).toThrow();
    store.setSurfaceStatus('busy');
    expect(() => store.claimBusinessControl('run', '/goals')).toThrow();
  });
});
