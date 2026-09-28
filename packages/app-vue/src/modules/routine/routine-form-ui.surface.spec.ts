import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../..');

function source(relative: string): string {
  return readFileSync(resolve(root, relative), 'utf8');
}

describe('Routine form UI convergence', () => {
  it('keeps the Routine editor aligned with the compact Goal workspace grammar', () => {
    const editor = source('app-vue/src/modules/routine/components/RoutineEditorDialog.vue');

    expect(editor).toContain('height-mode="workspace"');
    expect(editor).toContain('data-testid="routine-property-chips"');
    expect(editor).toContain('ProductAutoTextarea');
    expect(editor).toContain('ProductPropertyChip');
    expect(editor).toContain('type="date"');
    expect(editor).toContain('routine-borderless-control');
    expect(editor).toContain('DropdownMenuCheckboxItem');
    expect(editor).toContain('data-testid="routine-duration-chip"');
    expect(editor).toContain('data-testid="routine-anchor-chip"');
    expect(editor).toContain('data-testid="routine-frequency-chip"');
    expect(editor).toContain(':max-length="100"');
    expect(editor).toContain(':max-length="2000"');
    expect(editor).toContain('data-testid="routine-trigger-configuration"');
    expect(editor).not.toContain('<template #description>');
    expect(editor).not.toContain('<Label');
    expect(editor).not.toContain('<select');
    expect(editor).not.toContain('schedulerRuntime');
    expect(editor).toContain('data-testid="routine-desktop-runtime-hint"');
    expect(editor).toContain('localRuntimeAvailable');
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

    expect(view).toContain('data-testid="routine-global-enabled-switch"');
    expect(view).toContain('data-testid="routine-global-paused-badge"');
    expect(view).toContain('toggleGlobalEnabled');
    expect(view).toContain('snapshot.preferences.globalEnabled');
    expect(view).toContain('data-testid="routine-profile-enabled-switch"');
    expect(view).toContain('toggleProfileEnabled(selectedProfile, $event)');
    expect(view).toContain('await updateProfile(profile.id');
    expect(view).toContain('enabled,');
    expect(view).toContain('data-testid="routine-desktop-runtime-badge"');
    expect(view).toContain(':local-runtime-available="snapshot.capabilities.localRuntime"');
  });
});
