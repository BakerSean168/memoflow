import { DOMWrapper, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { nextTick } from 'vue';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import enUS from '../../../locales/en-US';
import CreateScheduleDialog from './CreateScheduleDialog.vue';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  missingWarn: false,
  fallbackWarn: false,
  messages: { 'en-US': enUS },
});

beforeAll(() => {
  // jsdom has no alert; the dialog's endBeforeStart guard calls it when
  // startTimestamp >= endTimestamp, which would throw and kill handleSubmit
  // before props.onSubmit is invoked.
  vi.stubGlobal('alert', vi.fn());
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('CreateScheduleDialog submission lifecycle', () => {
  beforeEach(() => {
    // Freeze the clock at mid-day UTC so nowDateStr()/nowTimeStr()/
    // oneHourLaterTimeStr() can never straddle a date/TZ boundary, keeping
    // startTimestamp < endTimestamp deterministic regardless of when CI runs.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('uses compact property chips and expands only one property editor at a time', async () => {
    const wrapper = mount(CreateScheduleDialog, {
      props: { modelValue: true, onSubmit: vi.fn().mockResolvedValue(true) },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    const chips = document.querySelector('[data-testid="schedule-property-chips"]');
    expect(chips).not.toBeNull();
    expect(document.querySelector('[data-testid="schedule-property-editor"]')).toBeNull();

    const whenChip = new DOMWrapper(
      document.querySelector<HTMLButtonElement>('[data-testid="schedule-when-chip"]')!,
    );
    const locationChip = new DOMWrapper(
      document.querySelector<HTMLButtonElement>('[data-testid="schedule-location-chip"]')!,
    );

    await whenChip.trigger('click');
    await nextTick();
    expect(whenChip.attributes('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('[data-testid="schedule-property-editor"]')).toHaveLength(1);
    expect(document.querySelector('#all-day')).not.toBeNull();

    await locationChip.trigger('click');
    await nextTick();
    expect(whenChip.attributes('aria-pressed')).toBe('false');
    expect(locationChip.attributes('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('[data-testid="schedule-property-editor"]')).toHaveLength(1);
    expect(document.querySelector('#location')).not.toBeNull();
    expect(document.querySelector('#all-day')).toBeNull();

    wrapper.unmount();
  });

  it('blocks duplicate submission and preserves the draft when saving fails', async () => {
    let resolveSubmit!: (value: boolean) => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const wrapper = mount(CreateScheduleDialog, {
      props: { modelValue: true, onSubmit },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    const title = new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="schedule-title-input"]')!,
    );
    const save = new DOMWrapper(
      document.querySelector<HTMLButtonElement>('[data-testid="schedule-save-button"]')!,
    );
    await title.setValue('Release review');
    await save.trigger('click');
    await save.trigger('click');
    await nextTick();

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(save.element.disabled).toBe(true);

    resolveSubmit(false);
    await nextTick();
    await nextTick();

    expect(title.element.value).toBe('Release review');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('still here');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  }, 20_000);

  it('closes and clears the draft only after saving succeeds', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const wrapper = mount(CreateScheduleDialog, {
      props: { modelValue: true, onSubmit },
      attachTo: document.body,
      global: { plugins: [i18n] },
    });
    await nextTick();

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('[data-testid="schedule-title-input"]')!,
    ).setValue('Release review');
    await new DOMWrapper(
      document.querySelector<HTMLButtonElement>('[data-testid="schedule-save-button"]')!,
    ).trigger('click');
    await nextTick();
    await nextTick();

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    wrapper.unmount();
  }, 20_000);
});
