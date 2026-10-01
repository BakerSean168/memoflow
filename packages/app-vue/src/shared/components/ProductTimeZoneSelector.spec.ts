import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { setProductTimePreferences } from '../utils/product-time';
import { productTimeZoneOptions } from '../utils/product-time-zone-options';
import ProductTimeZoneSelector from './ProductTimeZoneSelector.vue';

const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  setProductTimePreferences(createDefaultUserPreferenceProfile());
  vi.restoreAllMocks();
});

async function openSelector(modelValue = 'America/New_York') {
  vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Asia/Tokyo', 'America/New_York']);
  const profile = createDefaultUserPreferenceProfile();
  setProductTimePreferences({
    ...profile,
    regional: { ...profile.regional, timeZone: 'Asia/Shanghai' },
  });
  const wrapper = mount(ProductTimeZoneSelector, {
    props: { modelValue },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await wrapper.get('[data-testid="product-time-zone-selector"]').trigger('click');
  await flushPromises();
  return wrapper;
}

function body(selector: string) {
  return new DOMWrapper(document.querySelector(selector)!);
}

describe('ProductTimeZoneSelector', () => {
  it('includes Product zone and persisted aliases with exact IDs and marks the Product zone', async () => {
    const wrapper = await openSelector('US/Eastern');
    expect(document.querySelector('[data-zone-id="US/Eastern"]')).not.toBeNull();
    expect(body('[data-zone-id="Asia/Shanghai"]').text()).toContain('Product Time zone');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await body('[data-zone-id="US/Eastern"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['US/Eastern']);
  });

  it.each(['America/New_York', 'New York'])(
    'searches by ID or humanized text: %s',
    async (query) => {
      const wrapper = await openSelector();
      await body('[data-testid="product-time-zone-selector-search"]').setValue(query);
      await flushPromises();
      expect(document.querySelector('[data-zone-id="America/New_York"]')).not.toBeNull();
      expect(document.querySelector('[data-zone-id="Asia/Tokyo"]')).toBeNull();
      await body('[data-zone-id="America/New_York"]').trigger('click');
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['America/New_York']);
    },
  );

  it('does not persist search text or allow creating a zone', async () => {
    const wrapper = await openSelector();
    await body('[data-testid="product-time-zone-selector-search"]').setValue('Mars/Olympus_Mons');
    await body('[data-testid="product-time-zone-selector-search"]').trigger('keydown', {
      key: 'Enter',
    });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(document.body.textContent).toContain('No time zones found');
  });

  it('keeps selection controlled and disables opening', async () => {
    const wrapper = mount(ProductTimeZoneSelector, {
      props: { modelValue: 'UTC', disabled: true },
    });
    wrappers.push(wrapper);
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    await wrapper.setProps({ modelValue: 'Asia/Tokyo' });
    expect(wrapper.text()).toContain('Asia/Tokyo');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});

describe('Product timezone option provider', () => {
  it('prefers supportedValuesOf and always retains Product/persisted/UTC exact IDs', () => {
    const provider = vi.fn().mockReturnValue(['Europe/Paris', 'Europe/Paris', 'Mars/Invalid']);
    expect(productTimeZoneOptions('Asia/Shanghai', 'US/Eastern', provider)).toEqual([
      'Asia/Shanghai',
      'Europe/Paris',
      'US/Eastern',
      'UTC',
    ]);
    expect(provider).toHaveBeenCalledWith('timeZone');
  });

  it('has deterministic validated fallback for absent, empty, or throwing providers', () => {
    const expected = productTimeZoneOptions('Asia/Shanghai', 'Pacific/Chatham', null);
    expect(expected).toContain('Pacific/Chatham');
    expect(expected).toContain('America/New_York');
    expect(expected).toEqual([...expected].sort());
    expect(productTimeZoneOptions('Asia/Shanghai', 'Pacific/Chatham', () => [])).toEqual(expected);
    expect(
      productTimeZoneOptions('Asia/Shanghai', 'Pacific/Chatham', () => {
        throw new Error('unsupported');
      }),
    ).toEqual(expected);
  });

  it('feature-detects an absent runtime method safely', () => {
    const original = Object.getOwnPropertyDescriptor(Intl, 'supportedValuesOf')!;
    Object.defineProperty(Intl, 'supportedValuesOf', { value: undefined, configurable: true });
    try {
      expect(productTimeZoneOptions('UTC', 'US/Eastern')).toContain('US/Eastern');
    } finally {
      Object.defineProperty(Intl, 'supportedValuesOf', original);
    }
  });
});
