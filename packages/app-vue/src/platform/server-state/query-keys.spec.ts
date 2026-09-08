import { describe, expect, it } from 'vitest';
import {
  canonicalizeGovernanceListQuery,
  canonicalizeNotificationListQuery,
  canonicalizeTaskTemplateListQuery,
  governanceQueryKeys,
  notificationQueryKeys,
  taskTemplateQueryKeys,
} from './query-keys';

describe('notificationQueryKeys (plan §3.2 frozen shape)', () => {
  it('builds the frozen key hierarchy', () => {
    expect(notificationQueryKeys.all).toEqual(['server-state', 'notification']);
    expect(notificationQueryKeys.identity('id-1')).toEqual([
      'server-state',
      'notification',
      'id-1',
    ]);
    expect(notificationQueryKeys.lists('id-1')).toEqual([
      'server-state',
      'notification',
      'id-1',
      'list',
    ]);
    expect(notificationQueryKeys.list('id-1', { page: 1, limit: 20 })).toEqual([
      'server-state',
      'notification',
      'id-1',
      'list',
      { page: 1, limit: 20 },
    ]);
    expect(notificationQueryKeys.details('id-1')).toEqual([
      'server-state',
      'notification',
      'id-1',
      'detail',
    ]);
    expect(notificationQueryKeys.detail('id-1', 'n-1')).toEqual([
      'server-state',
      'notification',
      'id-1',
      'detail',
      'n-1',
    ]);
    expect(notificationQueryKeys.unread('id-1')).toEqual([
      'server-state',
      'notification',
      'id-1',
      'unread-count',
    ]);
  });

  it('isolates identities in every key segment', () => {
    const a = notificationQueryKeys.list('identity-a', { page: 1, limit: 20 });
    const b = notificationQueryKeys.list('identity-b', { page: 1, limit: 20 });
    expect(a).not.toEqual(b);
  });

  it('keeps different list params on different keys', () => {
    const page1 = notificationQueryKeys.list('id', { page: 1, limit: 20 });
    const page2 = notificationQueryKeys.list('id', { page: 2, limit: 20 });
    const capsule = notificationQueryKeys.list('id', { page: 1, limit: 10 });
    expect(page1).not.toEqual(page2);
    expect(page1).not.toEqual(capsule);
  });
});

describe('canonicalizeNotificationListQuery', () => {
  it('materializes pagination defaults and drops undefined', () => {
    expect(canonicalizeNotificationListQuery()).toEqual({ page: 1, limit: 20 });
    expect(canonicalizeNotificationListQuery({ page: 2 })).toEqual({ page: 2, limit: 20 });
    expect(canonicalizeNotificationListQuery({ limit: 10 })).toEqual({ page: 1, limit: 10 });
  });

  it('keeps primitive filters in frozen field order', () => {
    const canonical = canonicalizeNotificationListQuery({
      limit: 50,
      isRead: true,
      type: 'Reminder',
      endDate: 200,
      page: 3,
      startDate: 100,
    });
    expect(Object.keys(canonical)).toEqual([
      'page',
      'limit',
      'type',
      'isRead',
      'startDate',
      'endDate',
    ]);
    expect(canonical.startDate).toBe('100');
    expect(canonical.endDate).toBe('200');
  });

  it('rejects nothing at runtime but ignores non-primitive fields at the type boundary', () => {
    const canonical = canonicalizeNotificationListQuery({ page: 1, limit: 20 });
    expect(canonical).not.toHaveProperty('keyword');
  });
});

describe('taskTemplateQueryKeys (plan §3.2 frozen shape)', () => {
  it('builds the frozen key hierarchy', () => {
    expect(taskTemplateQueryKeys.all).toEqual(['server-state', 'task-template']);
    expect(taskTemplateQueryKeys.identity('id-1')).toEqual([
      'server-state',
      'task-template',
      'id-1',
    ]);
    expect(taskTemplateQueryKeys.list('id-1', { page: 1, limit: 20 })).toEqual([
      'server-state',
      'task-template',
      'id-1',
      'list',
      { page: 1, limit: 20 },
    ]);
    expect(taskTemplateQueryKeys.detail('id-1', 't-1')).toEqual([
      'server-state',
      'task-template',
      'id-1',
      'detail',
      't-1',
    ]);
  });

  it('keeps list and detail projections distinct', () => {
    expect(taskTemplateQueryKeys.lists('id')).not.toEqual(taskTemplateQueryKeys.details('id'));
  });
});

describe('canonicalizeTaskTemplateListQuery', () => {
  it('materializes pagination defaults and preserves explicit limit', () => {
    expect(canonicalizeTaskTemplateListQuery()).toEqual({ page: 1, limit: 20 });
    expect(canonicalizeTaskTemplateListQuery({ limit: 50 })).toEqual({ page: 1, limit: 50 });
  });

  it('normalizes status/labelIdsAll arrays (copy, dedupe, sort) and drops empty arrays', () => {
    const canonical = canonicalizeTaskTemplateListQuery({
      page: 1,
      limit: 20,
      status: ['Active', 'Active', 'Paused'],
      labelIdsAll: ['b', 'a', 'b'],
    });
    expect(canonical.status).toEqual(['Active', 'Paused']);
    expect(canonical.labelIdsAll).toEqual(['a', 'b']);

    const empty = canonicalizeTaskTemplateListQuery({ status: [], labelIdsAll: [] });
    expect(empty).not.toHaveProperty('status');
    expect(empty).not.toHaveProperty('labelIdsAll');
  });

  it('keeps scalar filters and puts arrays into the frozen field order', () => {
    const canonical = canonicalizeTaskTemplateListQuery({
      goalId: 'g-1',
      status: ['Active'],
      page: 2,
      labelIdsAll: ['x'],
      limit: 10,
    });
    expect(Object.keys(canonical)).toEqual([
      'page',
      'limit',
      'status',
      'goalId',
      'labelIdsAll',
    ]);
  });

  it('produces equal keys for semantically equal requests regardless of array order', () => {
    const a = canonicalizeTaskTemplateListQuery({ status: ['Active', 'Paused'] });
    const b = canonicalizeTaskTemplateListQuery({ status: ['Paused', 'Active'] });
    expect(a).toEqual(b);
  });
});

describe('governanceQueryKeys (governance pilot key scheme)', () => {
  it('builds the frozen key hierarchy', () => {
    expect(governanceQueryKeys.all).toEqual(['server-state', 'governance']);
    expect(governanceQueryKeys.identity('id-1')).toEqual(['server-state', 'governance', 'id-1']);
    expect(governanceQueryKeys.lists('id-1')).toEqual([
      'server-state',
      'governance',
      'id-1',
      'list',
    ]);
    expect(governanceQueryKeys.list('id-1', { page: 1, pageSize: 20 })).toEqual([
      'server-state',
      'governance',
      'id-1',
      'list',
      { page: 1, pageSize: 20 },
    ]);
    expect(governanceQueryKeys.details('id-1')).toEqual([
      'server-state',
      'governance',
      'id-1',
      'detail',
    ]);
    expect(governanceQueryKeys.detail('id-1', 'RuleId_x')).toEqual([
      'server-state',
      'governance',
      'id-1',
      'detail',
      'RuleId_x',
    ]);
    expect(governanceQueryKeys.revisions('id-1', 'RuleId_x')).toEqual([
      'server-state',
      'governance',
      'id-1',
      'revision',
      'RuleId_x',
    ]);
  });
});

describe('canonicalizeGovernanceListQuery', () => {
  it('materializes pagination defaults and drops empty optional fields', () => {
    expect(canonicalizeGovernanceListQuery()).toEqual({ page: 1, pageSize: 20 });
    expect(canonicalizeGovernanceListQuery({ page: 2, pageSize: 50 })).toEqual({
      page: 2,
      pageSize: 50,
    });
  });

  it('normalizes tags arrays and keeps scalar filters in frozen order', () => {
    const canonical = canonicalizeGovernanceListQuery({
      page: 1,
      pageSize: 20,
      status: 'Active',
      severity: 'Mandatory',
      tags: ['b', 'a', 'b'],
    });
    expect(Object.keys(canonical)).toEqual(['page', 'pageSize', 'status', 'severity', 'tags']);
    expect(canonical.tags).toEqual(['a', 'b']);
  });

  it('drops empty search and empty tags arrays', () => {
    const canonical = canonicalizeGovernanceListQuery({ search: '', tags: [] });
    expect(canonical).not.toHaveProperty('search');
    expect(canonical).not.toHaveProperty('tags');
  });
});
