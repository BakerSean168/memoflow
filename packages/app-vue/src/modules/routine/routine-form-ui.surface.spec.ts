import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../..');

function source(relative: string): string {
  return readFileSync(resolve(root, relative), 'utf8');
}

describe('Routine form UI convergence', () => {
  it('keeps Routine editor ownership in the parent while decomposing stable semantic boundaries', () => {
    const editor = source('app-vue/src/modules/routine/components/RoutineEditorDialog.vue');
    const wallClock = source('app-vue/src/modules/routine/components/WallClockTriggerEditor.vue');
    const elapsed = source('app-vue/src/modules/routine/components/ElapsedTriggerEditor.vue');
    const activeUsage = source(
      'app-vue/src/modules/routine/components/ActiveUsageTriggerEditor.vue',
    );
    const profileScope = source('app-vue/src/modules/routine/components/ProfileScopeControl.vue');
    const extractedSurface = [wallClock, elapsed, activeUsage, profileScope].join('\n');

    expect(editor).toContain('height-mode="workspace"');
    expect(editor).toContain('data-testid="routine-property-chips"');
    expect(editor).toContain('ProductAutoTextarea');
    expect(editor).toContain('ProductPropertyChip');
    expect(editor).toContain('<WallClockTriggerEditor');
    expect(editor).toContain('<ElapsedTriggerEditor');
    expect(editor).toContain('<ActiveUsageTriggerEditor');
    expect(editor).toContain('<ProfileScopeControl');
    expect(editor).toContain('function buildTrigger(): RoutineTriggerDto | null');
    expect(editor).toContain("timingOwner: 'scheduler'");
    expect(editor).toContain("timingOwner: 'local-runtime'");
    expect(editor).toContain('data-testid="routine-desktop-runtime-hint"');
    expect(editor).toContain('localRuntimeAvailable');

    for (const delegatedPrimitive of [
      'ProductDatePicker',
      'ProductTimePicker',
      'ProductTimeZoneSelector',
      'DropdownMenuCheckboxItem',
      'NumberField',
    ]) {
      expect(editor).not.toContain(delegatedPrimitive);
    }

    expect(wallClock).toContain('ProductDatePicker');
    expect(wallClock).toContain(`:allowed-kinds="['day']"`);
    expect(wallClock).toContain('ProductTimePicker');
    expect(wallClock).toContain('ProductTimeZoneSelector');
    expect(wallClock).toContain('NumberField');
    expect(wallClock).toContain('data-testid="routine-frequency-chip"');
    expect(wallClock).toContain('data-testid="routine-trigger-configuration"');

    expect(elapsed).toContain('data-testid="routine-duration-chip"');
    expect(elapsed).toContain('data-testid="routine-anchor-chip"');
    expect(elapsed).toContain('NumberField');

    expect(activeUsage).toContain('data-testid="routine-active-duration-chip"');
    expect(activeUsage).toContain('data-testid="routine-natural-break-chip"');
    expect(activeUsage).toContain('data-testid="routine-anchor-chip"');
    expect(activeUsage).toContain('NumberField');

    expect(profileScope).toContain('DropdownMenuCheckboxItem');
    expect(profileScope).toContain('data-testid="routine-profile-picker"');
    expect(profileScope).toContain('routine-profile-membership-');

    for (const type of ['date', 'time', 'number']) {
      expect(extractedSurface).not.toContain(`type="${type}"`);
    }
    expect(extractedSurface).not.toContain('<select');
    expect(editor).not.toContain('UniversalRoutineField');
    expect(extractedSurface).not.toContain('UniversalRoutineField');
    expect(editor).not.toContain('fieldSchema');
    expect(extractedSurface).not.toContain('fieldSchema');
    expect(editor).toContain(':max-length="100"');
    expect(editor).toContain(':max-length="2000"');
    expect(editor).not.toContain('<template #description>');
    expect(editor).not.toContain('<Label');
    expect(editor).not.toContain('schedulerRuntime');
    expect(editor).not.toContain('weekdaysText');
    expect(editor).not.toContain('1,2,3,4,5');
  });

  it('keeps context editing compact and borderless', () => {
    const profile = source('app-vue/src/modules/routine/components/RoutineProfileDialog.vue');

    expect(profile).toContain('ProductAutoTextarea');
    expect(profile).toContain(':max-length="100"');
    expect(profile).toContain(':max-length="2000"');
    expect(profile).not.toContain('routine-profile-enabled');
    expect(profile).not.toContain('<template #description>');
    expect(profile).not.toContain('<Label');
    expect(profile).not.toContain('<Input');
    expect(profile).not.toContain('<Textarea');
  });

  it('puts the durable context enabled gate beside the context selector', () => {
    const view = source('app-vue/src/modules/routine/views/RoutineConfigurationView.vue');

    expect(view).toContain('data-testid="routine-profile-scope-control"');
    expect(view).toContain('data-testid="routine-global-enabled-switch"');
    expect(view).toContain('data-testid="routine-profile-enabled-switch"');
    expect(view).toContain('data-testid="routine-global-paused-indicator"');
    expect(view).not.toContain('data-testid="routine-global-paused-badge"');
    expect(view).toContain('data-testid="routine-profile-runtime-action"');
    expect(view).toContain('!snapshot.capabilities.localRuntime');
    expect(view).toContain('toggleGlobalEnabled');
    expect(view).toContain('snapshot.preferences.globalEnabled');
    expect(view).toContain('toggleProfileEnabled(selectedProfile, $event)');
    expect(view).toContain('await updateProfile(profile.id');
    expect(view).toContain('enabled,');
    expect(view).toContain('data-testid="routine-desktop-runtime-badge"');
    expect(view).toContain(':local-runtime-available="snapshot.capabilities.localRuntime"');
  });
});
