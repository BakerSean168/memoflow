import { describe, expect, it } from 'vitest';
import {
  ROUTINE_METHOD_CATALOG,
  ROUTINE_METHOD_IDS,
  findRoutineMethod,
  getRoutineMethodTemplatePreset,
} from './index';

describe('Routine method library (ROUTINE-5302)', () => {
  it('ships exactly the six intentionally small initial methods', () => {
    expect(ROUTINE_METHOD_CATALOG.map((method) => method.id)).toEqual(ROUTINE_METHOD_IDS);
    expect(new Set(ROUTINE_METHOD_CATALOG.map((method) => method.name)).size).toBe(6);
  });

  it('records runtime ownership, editable parameters, intervention default, and source note', () => {
    for (const method of ROUTINE_METHOD_CATALOG) {
      expect(['WallClock', 'Protocol']).toContain(method.runtimeRequirement);
      expect(method.editableParameters.length).toBeGreaterThan(0);
      expect(['Gentle', 'Guided']).toContain(method.interventionDefault);
      expect(method.sourceNote.length).toBeGreaterThan(20);
    }
  });

  it('keeps Protocol methods out of ReminderTemplate presets', () => {
    expect(getRoutineMethodTemplatePreset('50-10-protocol')).toBeNull();
    expect(getRoutineMethodTemplatePreset('pomodoro')).toBeNull();
    expect(findRoutineMethod('pomodoro').recommendedParameters).toMatchObject({
      focusMinutes: 25,
      breakMinutes: 5,
      cycles: 4,
    });
  });

  it('projects WallClock methods into existing Routine template configuration', () => {
    expect(getRoutineMethodTemplatePreset('20-20-20')).toMatchObject({
      trigger: { type: 'Interval', intervalMinutes: 20 },
    });
    expect(getRoutineMethodTemplatePreset('sleep-wind-down')).toMatchObject({
      trigger: { type: 'FixedTime', fixedTime: '22:30' },
    });
  });
});
