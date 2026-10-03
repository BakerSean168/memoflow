/** @vitest-environment happy-dom */

import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { Target } from '@lucide/vue';
import { h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModuleCapsule from './ModuleCapsule.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      shell: { previewModule: 'Preview {name}' },
    },
  },
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ModuleCapsule', () => {
  it('separates direct navigation from hover and pinned preview interactions', async () => {
    vi.useFakeTimers();
    const wrapper = mount(ModuleCapsule, {
      props: { id: 'goal', label: 'Goals', route: '/goals', icon: Target },
      slots: { default: '<div data-testid="preview-content">Goals preview</div>' },
      global: { plugins: [i18n] },
    });

    const navigation = wrapper.get('[data-testid="capsule-nav-goal"]');
    const preview = wrapper.get('[data-testid="capsule-preview-goal"]');

    await navigation.trigger('click');
    expect(wrapper.emitted('open')).toEqual([[{ id: 'goal', route: '/goals' }]]);

    // Quick pointer passes must not flash the preview open.
    await preview.trigger('mouseenter');
    expect(preview.attributes('aria-expanded')).toBe('false');
    vi.advanceTimersByTime(200);
    await preview.trigger('mouseleave');
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(preview.attributes('aria-expanded')).toBe('false');

    // A deliberate hover dwell opens, then the existing close grace period applies.
    await preview.trigger('mouseenter');
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(preview.attributes('aria-expanded')).toBe('true');
    await preview.trigger('mouseleave');
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(preview.attributes('aria-expanded')).toBe('false');

    // Focus alone must not open the preview. Reka restores focus after a
    // Popover closes; opening on focus caused the hover panel to immediately reopen.
    await preview.trigger('focus');
    expect(preview.attributes('aria-expanded')).toBe('false');

    // Even when the trigger is focused, hover-open still closes after pointer leave.
    await preview.trigger('mouseenter');
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(preview.attributes('aria-expanded')).toBe('true');
    await preview.trigger('mouseleave');
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(preview.attributes('aria-expanded')).toBe('false');

    // Click/Enter semantics pin the interactive workspace.
    await preview.trigger('click');
    expect(wrapper.get('[data-testid="capsule-preview-goal"]').attributes('aria-expanded')).toBe(
      'true',
    );
    await preview.trigger('mouseleave');
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(wrapper.get('[data-testid="capsule-preview-goal"]').attributes('aria-expanded')).toBe(
      'true',
    );

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await nextTick();
    expect(wrapper.get('[data-testid="capsule-preview-goal"]').attributes('aria-expanded')).toBe(
      'false',
    );

    wrapper.unmount();
  });

  it('keeps hover-open content while an inner control is focused, then closes after focus leaves', async () => {
    vi.useFakeTimers();
    const wrapper = mount(ModuleCapsule, {
      attachTo: document.body,
      props: { id: 'goal', label: 'Goals', route: '/goals', icon: Target },
      slots: {
        default: '<input data-testid="preview-input" />',
      },
      global: { plugins: [i18n] },
    });

    const preview = wrapper.get('[data-testid="capsule-preview-goal"]');
    await preview.trigger('mouseenter');
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(preview.attributes('aria-expanded')).toBe('true');

    const content = document.querySelector<HTMLElement>('[data-capsule-preview-content="goal"]');
    const input = document.querySelector<HTMLInputElement>('[data-testid="preview-input"]');
    expect(content).not.toBeNull();
    expect(input).not.toBeNull();

    input?.focus();
    content?.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(preview.attributes('aria-expanded')).toBe('true');

    input?.blur();
    content?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(preview.attributes('aria-expanded')).toBe('false');

    wrapper.unmount();
  });

  it('exposes a close callback to interactive preview content', async () => {
    const wrapper = mount(ModuleCapsule, {
      attachTo: document.body,
      props: { id: 'goal', label: 'Goals', route: '/goals', icon: Target },
      slots: {
        default: ({ closePreview }) =>
          h('button', { 'data-testid': 'preview-close', onClick: closePreview }, 'Open all'),
      },
      global: { plugins: [i18n] },
    });

    const preview = wrapper.get('[data-testid="capsule-preview-goal"]');
    await preview.trigger('click');
    await nextTick();

    const closeButton = document.querySelector<HTMLButtonElement>('[data-testid="preview-close"]');
    expect(closeButton).not.toBeNull();
    closeButton?.click();
    await nextTick();
    expect(preview.attributes('aria-expanded')).toBe('false');

    wrapper.unmount();
  });
});

it('returns keyboard Escape focus to the named preview action without reopening it', async () => {
  const wrapper = mount(ModuleCapsule, {
    attachTo: document.body,
    props: { id: 'goal', label: 'Goals', route: '/goals', icon: Target },
    slots: { default: '<button data-testid="capsule-inner">Preview action</button>' },
    global: { plugins: [i18n] },
  });
  const preview = wrapper.get('[data-testid="capsule-preview-goal"]');
  expect(wrapper.get('[data-testid="capsule-nav-goal"]').attributes('aria-label')).toBe('Goals');
  expect(preview.classes()).toEqual(expect.arrayContaining(['h-8', 'w-8']));
  preview.element.focus();
  await preview.trigger('click', { detail: 0 });
  await flushPromises();
  const inner = document.querySelector<HTMLButtonElement>('[data-testid="capsule-inner"]')!;
  expect(document.activeElement).toBe(inner);
  inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await flushPromises();
  expect(preview.attributes('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(preview.element);
  wrapper.unmount();
});
