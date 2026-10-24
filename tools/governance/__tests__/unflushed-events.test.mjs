import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { auditUnflushedEvents, findEventEmittingAggregates } from '../lib/unflushed-events.mjs';

function projectWith(files) {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [filePath, content] of Object.entries(files)) {
    project.createSourceFile(filePath, content);
  }
  return project;
}

const EMITTING_AGGREGATE = `
  import { AggregateRoot } from '@memoflow/utils/domain';
  export class Goal extends AggregateRoot {
    complete() { this.addDomainEvent('goal:completed', {}); }
  }
`;

const SILENT_AGGREGATE = `
  import { AggregateRoot } from '@memoflow/utils/domain';
  export class UserSetting extends AggregateRoot {
    rename(name) { this._name = name; }
  }
`;

describe('findEventEmittingAggregates', () => {
  it('collects only AggregateRoot subclasses that call addDomainEvent', () => {
    const project = projectWith({
      '/agg/goal.ts': EMITTING_AGGREGATE,
      '/agg/setting.ts': SILENT_AGGREGATE,
    });
    const emitting = findEventEmittingAggregates(project);
    expect(emitting.has('Goal')).toBe(true);
    expect(emitting.has('UserSetting')).toBe(false);
  });
});

describe('auditUnflushedEvents', () => {
  it('flags a repository saving an event-emitting aggregate without flush (positive)', () => {
    const project = projectWith({
      '/agg/goal.ts': EMITTING_AGGREGATE,
      '/repo/goal-repo.ts': `
        import { Goal } from '../agg/goal';
        export class GoalRepository {
          async save(goal: Goal): Promise<void> { await this.db.write(goal); }
        }
      `,
    });
    const { violations } = auditUnflushedEvents(project);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      className: 'GoalRepository',
      method: 'save',
      aggregate: 'Goal',
    });
  });

  it('passes when the repository flushes (negative: flushDomainEvents)', () => {
    const project = projectWith({
      '/agg/goal.ts': EMITTING_AGGREGATE,
      '/repo/goal-repo.ts': `
        import { Goal } from '../agg/goal';
        import { flushDomainEvents } from '@memoflow/utils/domain';
        export class GoalRepository {
          async save(goal: Goal): Promise<void> {
            await this.db.write(goal);
            flushDomainEvents(pub, goal);
          }
        }
      `,
    });
    const { violations } = auditUnflushedEvents(project);
    expect(violations).toHaveLength(0);
  });

  it('passes when the repository extends AggregateRepositoryBase (negative: base flushes)', () => {
    const project = projectWith({
      '/agg/goal.ts': EMITTING_AGGREGATE,
      '/repo/goal-repo.ts': `
        import { Goal } from '../agg/goal';
        import { AggregateRepositoryBase } from '@memoflow/patterns';
        export class GoalRepository extends AggregateRepositoryBase<Goal> {
          protected async persist(goal: Goal): Promise<void> { await this.db.write(goal); }
        }
      `,
    });
    const { violations } = auditUnflushedEvents(project);
    expect(violations).toHaveLength(0);
  });

  it('does not flag repositories saving silent (non-emitting) aggregates', () => {
    const project = projectWith({
      '/agg/setting.ts': SILENT_AGGREGATE,
      '/repo/setting-repo.ts': `
        import { UserSetting } from '../agg/setting';
        export class UserSettingRepository {
          async save(s: UserSetting): Promise<void> { await this.db.write(s); }
        }
      `,
    });
    const { violations } = auditUnflushedEvents(project);
    expect(violations).toHaveLength(0);
  });

  it('honours the allowlist (baseline exemption)', () => {
    const project = projectWith({
      '/agg/goal.ts': EMITTING_AGGREGATE,
      '/repo/goal-repo.ts': `
        import { Goal } from '../agg/goal';
        export class GoalRepository {
          async save(goal: Goal): Promise<void> { await this.db.write(goal); }
        }
      `,
    });
    const { violations, allowlistedHits } = auditUnflushedEvents(project, {
      isAllowlisted: (filePath) => filePath.endsWith('/repo/goal-repo.ts'),
    });
    expect(violations).toHaveLength(0);
    expect(allowlistedHits).toBe(1);
  });
});
