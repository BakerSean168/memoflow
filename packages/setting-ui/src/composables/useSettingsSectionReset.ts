/**
 * Section-level "restore defaults" registry (Issue #927).
 *
 * The settings shell renders one restore action for the active section, but the
 * mutation belongs to the section that owns the defaults. A section registers the
 * action it already exposes, so the shell only confirms and runs it. Sections
 * without a registered action hide the button instead of offering a no-op.
 */
import { inject, onBeforeUnmount, provide, shallowReactive, type InjectionKey } from 'vue';

/** Restores the section's settings to their defaults; the owner supplies it. */
export type SettingsSectionResetAction = () => Promise<void> | void;

export interface SettingsSectionResetRegistry {
  register(section: string, action: SettingsSectionResetAction): void;
  unregister(section: string): void;
  action(section: string): SettingsSectionResetAction | undefined;
  has(section: string): boolean;
}

export const SETTINGS_SECTION_RESET_KEY: InjectionKey<SettingsSectionResetRegistry> = Symbol(
  'memoflow.settings.section-reset',
);

/** Create the reactive registry the settings shell provides to its sections. */
export function createSettingsSectionResetRegistry(): SettingsSectionResetRegistry {
  const actions = shallowReactive(new Map<string, SettingsSectionResetAction>());
  return {
    register(section, action) {
      actions.set(section, action);
    },
    unregister(section) {
      actions.delete(section);
    },
    action(section) {
      return actions.get(section);
    },
    has(section) {
      return actions.has(section);
    },
  };
}

export function provideSettingsSectionReset(registry: SettingsSectionResetRegistry): void {
  provide(SETTINGS_SECTION_RESET_KEY, registry);
}

/** Register the enclosing section's restore action with the settings shell. */
export function useSettingsSectionReset(section: string, action: SettingsSectionResetAction): void {
  const registry = inject(SETTINGS_SECTION_RESET_KEY, null);
  if (!registry) return;
  registry.register(section, action);
  onBeforeUnmount(() => registry.unregister(section));
}
