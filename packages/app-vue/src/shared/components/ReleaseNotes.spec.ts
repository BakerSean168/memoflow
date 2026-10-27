import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { DESKTOP_BRIDGE_KEY } from '../../di/keys';
import { SystemChannels } from '@memoflow/desktop-contracts';
import ReleaseNotes from './ReleaseNotes.vue';

describe('ReleaseNotes', () => {
  it('opens desktop links through the safe external URL bridge', async () => {
    const invoke = vi.fn().mockResolvedValue({ ok: true });
    const wrapper = mount(ReleaseNotes, {
      props: { source: '<p><a href="https://example.com"><strong>Details</strong></a></p>' },
      global: {
        provide: { [DESKTOP_BRIDGE_KEY as symbol]: { invoke, on: vi.fn(), off: vi.fn() } },
      },
    });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    wrapper.get('a strong').element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(SystemChannels.OPEN_EXTERNAL_URL, {
      url: 'https://example.com',
    });
  });

  it('handles a rejected desktop opener without navigating the app', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('External opener unavailable'));
    const wrapper = mount(ReleaseNotes, {
      props: { source: '[Details](https://example.com)' },
      global: {
        provide: { [DESKTOP_BRIDGE_KEY as symbol]: { invoke, on: vi.fn(), off: vi.fn() } },
      },
    });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    wrapper.get('a').element.dispatchEvent(event);
    await flushPromises();
    expect(event.defaultPrevented).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(wrapper.get('a').text()).toBe('Details');
  });

  it('rebuilds the displayed nodes when release notes change', async () => {
    const wrapper = mount(ReleaseNotes, { props: { source: '<h1>Old release</h1>' } });
    await wrapper.setProps({ source: '# New release\n\n**Fixed** updates' });
    expect(wrapper.get('h1').text()).toBe('New release');
    expect(wrapper.get('strong').text()).toBe('Fixed');
    expect(wrapper.text()).not.toContain('Old release');
  });

  it('uses a separate safe browsing context without a desktop bridge', () => {
    const wrapper = mount(ReleaseNotes, { props: { source: '[Details](https://example.com)' } });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    let preventedByComponent = true;
    // Observe the component's policy, then stop the DOM emulator from browsing the Internet.
    wrapper.element.addEventListener('click', (click) => {
      preventedByComponent = click.defaultPrevented;
      click.preventDefault();
    });
    wrapper.get('a').element.dispatchEvent(event);
    expect(preventedByComponent).toBe(false);
    expect(wrapper.get('a').attributes('rel')).toBe('noopener noreferrer');
    expect(wrapper.get('a').attributes('target')).toBe('_blank');
  });
});
