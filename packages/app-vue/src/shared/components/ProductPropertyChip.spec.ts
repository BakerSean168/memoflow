import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ProductPropertyChip from './ProductPropertyChip.vue';
import { keyboard } from '../keyboard/runtime';

describe('ProductPropertyChip', () => {
  it('renders a compact property trigger and exposes active state accessibly', () => {
    const wrapper = mount(ProductPropertyChip, {
      props: { active: true },
      slots: { default: 'Schedule', icon: '<span data-testid="icon">S</span>' },
    });

    const button = wrapper.get('button');
    expect(button.attributes('data-slot')).toBe('product-property-chip');
    expect(button.attributes('aria-pressed')).toBe('true');
    expect(button.text()).toContain('Schedule');
    expect(wrapper.get('[data-testid="icon"]').exists()).toBe(true);
  });

  it('does not invent aria-pressed for value chips that are not toggle controls', () => {
    const wrapper = mount(ProductPropertyChip, { slots: { default: 'Target: Q4' } });
    expect(wrapper.get('button').attributes('aria-pressed')).toBeUndefined();
  });

  it('keeps value chips in the quiet neutral visual family', () => {
    const button = mount(ProductPropertyChip, { slots: { default: '2026年9月12日' } }).get('button');
    expect(button.classes()).toContain('bg-[hsl(var(--surface-raised)/0.48)]');
    expect(button.classes()).toContain('text-[hsl(var(--foreground-muted))]');
  });

  it('keeps Enter/Space activation native: a focused chip is a plain button the keyboard runtime does not intercept', () => {
    const activate = vi.fn();
    window.addEventListener('keydown', keyboard.handle, { capture: true });
    try {
      const wrapper = mount(ProductPropertyChip, {
        props: { active: true },
        attrs: { onClick: activate },
        attachTo: document.body,
      });
      const button = wrapper.get('button').element as HTMLButtonElement;
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
      button.focus();
      expect(document.activeElement).toBe(button);
      // A bound command still fires through the attached runtime, so the
      // un-prevented assertions below are not vacuous.
      button.dispatchEvent(
        new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }),
      );
      expect(keyboard.helpOpen.value).toBe(true);
      keyboard.helpOpen.value = false;
      for (const key of ['Enter', ' ']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        button.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        // No keydown→click shim: a real browser fires exactly one click from
        // the native default action, and a manual one would double-activate.
        expect(activate).not.toHaveBeenCalled();
      }
      button.click();
      expect(activate).toHaveBeenCalledTimes(1);
      wrapper.unmount();
    } finally {
      window.removeEventListener('keydown', keyboard.handle, { capture: true });
    }
  });
});
