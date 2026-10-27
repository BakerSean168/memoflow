import { installAiUiHost } from '@ai-ui-test-host/di/ai-ui-host';
installAiUiHost();
/** @vitest-environment jsdom */
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { useNativeModelVisibility } from './nativeModelVisibility';

afterEach(() => localStorage.clear());

describe('native model visibility: identity-scoped durable preference', () => {
  it('defaults to showing a real catalog and persists one hidden model per Profile and instance', async () => {
    const identity = ref('desktop-profile-a');
    const settings = useNativeModelVisibility(
      () => identity.value,
      () => 'mvc1:' + 'a'.repeat(64),
    );
    const visible = computed(() => settings.isVisible('codex', 'model-a'));
    expect(visible.value).toBe(true);
    expect(settings.setVisible('codex', 'model-a', false)).toBe(true);
    await nextTick();
    expect(visible.value).toBe(false);
    expect(settings.isVisible('codex', 'model-b')).toBe(true);
    expect(settings.isVisible('claude', 'model-a')).toBe(true);

    // New component/restart gets the same preference from Profile-scoped storage.
    const afterRestart = useNativeModelVisibility(
      () => identity.value,
      () => 'mvc1:' + 'a'.repeat(64),
    );
    expect(afterRestart.isVisible('codex', 'model-a')).toBe(false);
    identity.value = 'desktop-profile-b';
    expect(afterRestart.isVisible('codex', 'model-a')).toBe(true);
    identity.value = 'desktop-profile-a';
    expect(afterRestart.setVisible('codex', 'model-a', true)).toBe(true);
    await nextTick();
    expect(visible.value).toBe(true);
  });

  it('does not persist an unscoped preference or trust malformed storage data', () => {
    const unscoped = useNativeModelVisibility(
      () => '',
      () => undefined,
    );
    expect(unscoped.canPersist.value).toBe(false);
    expect(unscoped.setVisible('codex', 'model-a', false)).toBe(false);
    expect(unscoped.isVisible('codex', 'model-a')).toBe(true);
    expect(localStorage.length).toBe(0);

    localStorage.setItem(
      'ai:native-model-hidden:v2:desktop-profile-a:codex:mvc1:' + 'a'.repeat(64),
      '{"broken":1}',
    );
    const scoped = useNativeModelVisibility(
      () => 'desktop-profile-a',
      () => 'mvc1:' + 'a'.repeat(64),
    );
    expect(scoped.isVisible('codex', 'model-a')).toBe(true);
    expect(scoped.setVisible('codex', 'model-a', false)).toBe(true);
    expect(scoped.isVisible('codex', 'model-a')).toBe(false);
  });
});

it('isolates a changed native context for the same Profile/instance and ignores legacy preferences', async () => {
  const context = ref('mvc1:' + 'a'.repeat(64));
  localStorage.setItem('ai:native-model-hidden:v1:desktop-profile-a:codex', '["legacy-model"]');
  const settings = useNativeModelVisibility(
    () => 'desktop-profile-a',
    () => context.value,
  );
  const composer = useNativeModelVisibility(
    () => 'desktop-profile-a',
    () => context.value,
  );
  const visible = computed(() => composer.isVisible('codex', 'model-a'));
  expect(settings.isVisible('codex', 'legacy-model')).toBe(true);
  expect(settings.setVisible('codex', 'model-a', false)).toBe(true);
  await nextTick();
  expect(visible.value).toBe(false);
  context.value = 'mvc1:' + 'b'.repeat(64);
  expect(visible.value).toBe(true);
  expect(settings.setVisible('codex', 'model-b', false)).toBe(true);
  context.value = 'mvc1:' + 'a'.repeat(64);
  expect(visible.value).toBe(false);
  expect(settings.isVisible('codex', 'model-b')).toBe(true);
  expect(localStorage.getItem('ai:native-model-hidden:v1:desktop-profile-a:codex')).toBe(
    '["legacy-model"]',
  );
});

it.each([undefined, '', '/private/native/home', 'alice@example.test', 'mvc1:untrusted'])(
  'refuses an unverifiable context %j',
  (context) => {
    const visibility = useNativeModelVisibility(
      () => 'desktop-profile-a',
      () => context,
    );
    expect(visibility.canPersist.value).toBe(false);
    expect(visibility.setVisible('codex', 'model', false)).toBe(false);
    expect(visibility.isVisible('codex', 'model')).toBe(true);
    expect(localStorage.length).toBe(0);
  },
);

it('refreshes mounted consumers on a storage event for the same verified context', async () => {
  const context = 'mvc1:' + 'a'.repeat(64);
  const wrapper = mount(
    defineComponent({
      setup() {
        const visibility = useNativeModelVisibility(
          () => 'profile',
          () => context,
        );
        return () => h('span', String(visibility.isVisible('codex', 'model')));
      },
    }),
  );
  try {
    expect(wrapper.text()).toBe('true');
    const key = 'ai:native-model-hidden:v2:profile:codex:' + context;
    localStorage.setItem(key, '["model"]');
    window.dispatchEvent(new StorageEvent('storage', { key }));
    await nextTick();
    expect(wrapper.text()).toBe('false');
  } finally {
    wrapper.unmount();
  }
});
