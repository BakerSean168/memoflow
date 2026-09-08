import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mapTablesToInvalidationIntents } from './server-state';

describe('mapTablesToInvalidationIntents (plan §3.3 pilot table mapping)', () => {
  it('maps notifications → notification intent', () => {
    expect(mapTablesToInvalidationIntents(['notifications'], 'id-1')).toEqual([
      { target: 'notification', identityScope: 'id-1', source: 'powersync' },
    ]);
  });

  it('maps task_templates → task-plan projection all (lists/graphs/details)', () => {
    expect(mapTablesToInvalidationIntents(['task_templates'], 'id-1')).toEqual([
      { target: 'task-plan', identityScope: 'id-1', source: 'powersync', projection: 'all' },
    ]);
  });

  it('maps rules → governance all (lists/details/revisions)', () => {
    expect(mapTablesToInvalidationIntents(['rules'], 'id-1')).toEqual([
      { target: 'governance', identityScope: 'id-1', source: 'powersync', projection: 'all' },
    ]);
  });

  it('maps rule_revisions → governance revisions only', () => {
    expect(mapTablesToInvalidationIntents(['rule_revisions'], 'id-1')).toEqual([
      { target: 'governance', identityScope: 'id-1', source: 'powersync', projection: 'revisions' },
    ]);
  });

  it('emits one intent per pilot table for a mixed batch (deduped)', () => {
    const intents = mapTablesToInvalidationIntents(
      ['notifications', 'task_templates', 'notifications', 'rules'],
      'id-1',
    );
    expect(intents).toHaveLength(3);
    expect(intents.map((i) => `${i.target}:${i.projection ?? ''}`).sort()).toEqual([
      'governance:all',
      'notification:',
      'task-plan:all',
    ]);
  });

  it('ignores non-pilot tables so they keep flowing through the legacy Pinia invalidator', () => {
    expect(mapTablesToInvalidationIntents(['goals', 'schedules', 'user_settings'], 'id-1')).toEqual(
      [],
    );
  });

  it('carries the identityScope through for cache isolation', () => {
    const [intent] = mapTablesToInvalidationIntents(['notifications'], 'profile-9');
    expect(intent.identityScope).toBe('profile-9');
  });
});

describe('desktop server-state lifecycle (P2-3)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('registers and fires the pending startup cancel on clearDesktopServerStateIdentity', async () => {
    const { registerDesktopServerStateStartupCancel, clearDesktopServerStateIdentity } =
      await import('./server-state');
    const cancel = vi.fn();
    registerDesktopServerStateStartupCancel(cancel);

    clearDesktopServerStateIdentity('id-1');
    expect(cancel).toHaveBeenCalledTimes(1);

    // The cancel is drained after firing: a later clear must not double-fire it.
    clearDesktopServerStateIdentity('id-1');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('stops registered realtime sources before clearing the identity', async () => {
    const { registerDesktopServerStateSource, clearDesktopServerStateIdentity } =
      await import('./server-state');
    const source = { stop: vi.fn() };
    registerDesktopServerStateSource(source);

    clearDesktopServerStateIdentity('id-1');
    expect(source.stop).toHaveBeenCalledTimes(1);
  });

  it('flags the runtime disposed so deferred startup is skipped after logout/lock', async () => {
    const { isDesktopServerStateDisposed, clearDesktopServerStateIdentity } =
      await import('./server-state');
    expect(isDesktopServerStateDisposed()).toBe(false);

    clearDesktopServerStateIdentity('id-1');
    expect(isDesktopServerStateDisposed()).toBe(true);
  });
});
