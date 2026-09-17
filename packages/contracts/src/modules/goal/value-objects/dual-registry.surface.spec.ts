/**
 * Dual registry suite (elegance E3b tax cut).
 * Merged 2 dual-retired surface locks from this directory.
 * Behavior/assertions preserved; individual *-dual.surface.spec.ts removed.
 * Sources: instant-transfer-date dual keep-boundary (was domain-date dual), exact-vo-dto-dual.surface.spec.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// --- residual 859: Instant/TransferDate dual keep-boundary (DomainDate retired T10) ---
{
  /**
   * Residual 859 (P8): isomorphic Instant duals may type-alias (GoalTimeRangeDTO); shape-mismatch duals stay separate.
   * DomainDate type retired (ADR-037 T10); duals are Instant (domain) vs TransferDate (DTO) names,
   * not Date-vs-number. Exact VO duals (FrequencyAdjustment/ResponseMetrics, residual 857) remain aliases.
   * Cloud authentication contracts now live in the dedicated cloud-auth surface.
   * Does not flip §13.2 checkboxes; OAuth / multi-engine Agent / full PR gate remain open.
   */
  describe('instant transfer-date dual keep-boundary (residual 859)', () => {
    const goalVo = __dirname;
    const accountVo = resolve(goalVo, '../../account/value-objects');
    const taskVo = resolve(goalVo, '../../task/value-objects');
    const primitives = resolve(goalVo, '../../../primitives');
    const taskPlanSchedule = readFileSync(resolve(taskVo, 'task-plan-schedule.ts'), 'utf8');
    const taskOccurrenceResult = readFileSync(resolve(taskVo, 'task-occurrence-result.ts'), 'utf8');

    it('DomainDate type is gone from contracts primitives (ADR-037 T10)', () => {
      const index = readFileSync(resolve(primitives, 'index.ts'), 'utf8');
      expect(index).not.toContain('DomainDate');
      expect(index).not.toContain('domain-date');
      expect(index).toContain('Instant');
      expect(index).toContain('TransferDate');
      expect(index).toContain("export * from './ymd'");
      expect(index).toContain("export type { Hm } from './hm'");
    });

    it('retires GoalTimeRange and owns GoalTimeframe as calendar-native product truth', () => {
      expect(existsSync(resolve(goalVo, 'goal-time-range.ts'))).toBe(false);
      const goalTime = readFileSync(resolve(goalVo, 'goal-timeframe.ts'), 'utf8');
      const weight = readFileSync(resolve(goalVo, 'key-result-weight-snapshot.ts'), 'utf8');
      expect(goalTime).toContain('GoalTimeframeSchema');
      expect(goalTime).toContain('YmdSchema');
      expect(goalTime).not.toContain('Instant');
      expect(goalTime).not.toContain('TransferDate');
      expect(goalTime).not.toContain('dueDate');
      expect(weight).toMatch(/export interface KeyResultWeightSnapshot\b/);
      expect(weight).toMatch(/export interface KeyResultWeightSnapshotDTO\b/);
      expect(weight).not.toContain(
        'export type KeyResultWeightSnapshotDTO = KeyResultWeightSnapshot',
      );
      expect(weight).toContain('Instant');
      expect(weight).toContain('TransferDate');
      expect(weight).not.toContain('DomainDate');
    });

    it('keeps account calendar-day and task Instant transfer contracts explicit', () => {
      const profile = readFileSync(resolve(accountVo, 'account-profile.ts'), 'utf8');

      expect(profile).toMatch(/export interface AccountProfile\b/);
      expect(profile).toMatch(/export interface AccountProfileDTO\b/);
      expect(profile).toContain('birthday: Ymd | null');
      expect(profile).not.toContain('DomainDate');

      expect(existsSync(resolve(taskVo, 'recurrence-rule.ts'))).toBe(false);
      expect(existsSync(resolve(taskVo, 'task-time-config.ts'))).toBe(false);
      expect(taskPlanSchedule).toContain(
        'export const TaskPlanScheduleSchema = z.discriminatedUnion',
      );
      expect(taskOccurrenceResult).toContain(
        'export const TaskOccurrenceResultSchema = z.discriminatedUnion',
      );
    });

    it('keeps the residual 859 boundary marker present after retired Reminder value objects are removed', () => {
      expect(readFileSync(__filename, 'utf8')).toContain('Residual 859');
    });
  });
}

// --- merged from exact-vo-dto-dual.surface.spec.ts ---
{
  /**
   * Residual 853: exact-match VO/DTO duals retired (Instant/TransferDate duals left as separate interfaces).
   * ChecklistItemDefinitionDTO = sole interface + type alias.
   * Residual 859 (soft): Instant/TransferDate dual keep-boundary owned above (this block keeps Residual 853 only).
   */
  describe('exact vo dto duals retired (residual 853)', () => {
    const goalVo = __dirname;
    const taskVo = resolve(goalVo, '../../task/value-objects');

    const checklist = readFileSync(resolve(taskVo, 'checklist-item-definition.ts'), 'utf8');

    it('owns ChecklistItemDefinitionDTO as type alias; keeps Instant duals as interfaces', () => {
      expect(checklist).toContain('export const ChecklistItemDefinitionSchema = z.object({');
      expect(checklist).toContain(
        'export type ChecklistItemDefinition = z.infer<typeof ChecklistItemDefinitionSchema>',
      );
      expect(checklist).toContain(
        'export type ChecklistItemDefinitionDTO = ChecklistItemDefinition',
      );
      expect(checklist).not.toMatch(/export interface ChecklistItemDefinitionDTO\b/);
      expect(existsSync(resolve(goalVo, 'goal-time-range.ts'))).toBe(false);
      expect(existsSync(resolve(taskVo, 'recurrence-rule.ts'))).toBe(false);
      expect(existsSync(resolve(taskVo, 'task-time-config.ts'))).toBe(false);
    });
  });
}
