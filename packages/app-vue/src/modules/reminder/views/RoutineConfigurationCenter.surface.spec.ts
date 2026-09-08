import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(__dirname, '../../../..');

function read(relativePath: string): string {
  return readFileSync(resolve(packageRoot, relativePath), 'utf8');
}

describe('ROUTINE-5301 configuration-center surface', () => {
  it('keeps existing shell/E2E selectors while framing this page as configuration only', () => {
    const source = read('src/modules/reminder/views/ReminderLinearView.vue');

    for (const selector of [
      'reminder-linear-view',
      'reminder-page-toolbar',
      'reminder-linear-heading',
      'reminder-search-input',
      'reminder-master-switch',
      'create-reminder-group-button',
      'create-reminder-template-button',
      'reminder-group-sidebar',
      'reminder-group-all',
      'reminder-content',
      'reminder-scroll-host',
    ]) {
      expect(source).toContain(selector);
    }

    expect(source).toContain('routine-configuration-summary');
    expect(source).toContain('reminder.linear.configurationDescription');
    expect(source).toContain('reloadReminderScene');
  });

  it('does not resurrect legacy ControlMode as a product decision', () => {
    const view = read('src/modules/reminder/views/ReminderLinearView.vue');
    const profileDialog = read('src/modules/reminder/components/GroupDialog.vue');
    const moveDialog = read('src/modules/reminder/components/TemplateMoveDialog.vue');
    const detail = read('src/modules/reminder/components/ReminderTemplateCard.vue');

    expect(view).not.toMatch(/switchGroupControlMode|switchControlMode|\bControlMode\b/);
    expect(profileDialog).not.toMatch(/RadioGroup|formData\.controlMode|sectionControlMode/);
    expect(moveDialog).not.toMatch(/getGroupControlMode|controlModeGroup|controlModeIndividual/);
    expect(detail).not.toMatch(/fieldGroupControlMode|getGroupControlModeLabel|Mock stats/);

    expect(profileDialog).toContain('routine-profile-gate-hint');
    expect(moveDialog).toContain('previewProfilePaused');
    expect(detail).toContain('fieldProfileGate');
  });

  it('uses only real DTO-backed counts and removes fake occurrence statistics', () => {
    const view = read('src/modules/reminder/views/ReminderLinearView.vue');
    const detail = read('src/modules/reminder/components/ReminderTemplateCard.vue');

    expect(view).toContain('templates.length');
    expect(view).toContain('runningRoutineCount');
    expect(view).toContain('groups.length');
    expect(detail).not.toContain('const stats = computed');
    expect(detail).not.toContain('sectionStats');
  });
  it('exposes the six-method library without turning Protocol methods into ReminderTemplate timers', () => {
    const view = read('src/modules/reminder/views/ReminderLinearView.vue');
    const dialog = read('src/modules/reminder/components/TemplateDialog.vue');

    expect(view).toContain('routine-method-library');
    expect(view).toContain('ROUTINE_METHOD_CATALOG');
    expect(view).toContain('method.templatePreset');
    expect(dialog).toContain('openForPreset');
    expect(dialog).toContain('RoutineMethodTemplatePreset');
  });

});
