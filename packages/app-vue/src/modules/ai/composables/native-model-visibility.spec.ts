/** @vitest-environment jsdom */
import { computed, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { useNativeModelVisibility } from './native-model-visibility';

afterEach(() => localStorage.clear());

describe('native model visibility: identity-scoped durable preference', () => {
  it('defaults to showing a real catalog and persists one hidden model per Profile and instance', async () => {
    const identity = ref('desktop-profile-a');
    const settings = useNativeModelVisibility(() => identity.value);
    const visible = computed(() => settings.isVisible('codex', 'model-a'));
    expect(visible.value).toBe(true);
    expect(settings.setVisible('codex', 'model-a', false)).toBe(true);
    await nextTick();
    expect(visible.value).toBe(false);
    expect(settings.isVisible('codex', 'model-b')).toBe(true);
    expect(settings.isVisible('claude', 'model-a')).toBe(true);

    // New component/restart gets the same preference from Profile-scoped storage.
    const afterRestart = useNativeModelVisibility(() => identity.value);
    expect(afterRestart.isVisible('codex', 'model-a')).toBe(false);
    identity.value = 'desktop-profile-b';
    expect(afterRestart.isVisible('codex', 'model-a')).toBe(true);
    identity.value = 'desktop-profile-a';
    expect(afterRestart.setVisible('codex', 'model-a', true)).toBe(true);
    await nextTick();
    expect(visible.value).toBe(true);
  });

  it('does not persist an unscoped preference or trust malformed storage data', () => {
    const unscoped = useNativeModelVisibility(() => '');
    expect(unscoped.canPersist.value).toBe(false);
    expect(unscoped.setVisible('codex', 'model-a', false)).toBe(false);
    expect(unscoped.isVisible('codex', 'model-a')).toBe(true);
    expect(localStorage.length).toBe(0);

    localStorage.setItem('ai:native-model-hidden:v1:desktop-profile-a:codex', '{"broken":1}');
    const scoped = useNativeModelVisibility(() => 'desktop-profile-a');
    expect(scoped.isVisible('codex', 'model-a')).toBe(true);
    expect(scoped.setVisible('codex', 'model-a', false)).toBe(true);
    expect(scoped.isVisible('codex', 'model-a')).toBe(false);
  });
});
