import { describe, expect, it } from 'vitest';
import { surfaceDescriptorToContextEntity } from './surfaceContext';

describe('surfaceDescriptorToContextEntity', () => {
  it('maps visible goal/task detail tabs to implicit entity context', () => {
    expect(
      surfaceDescriptorToContextEntity({
        module: 'goal',
        route: '/goals/goal-1',
        title: '找到前端工作',
      }),
    ).toEqual({ entityType: 'goal', id: 'goal-1', label: '找到前端工作' });

    expect(
      surfaceDescriptorToContextEntity({
        module: 'task',
        route: '/tasks/task%201?tab=detail',
        title: '完善简历',
      }),
    ).toEqual({ entityType: 'task', id: 'task 1', label: '完善简历' });

    expect(
      surfaceDescriptorToContextEntity({
        module: 'note',
        route: '/repository?note=kdoc_123%3Aabc',
        title: 'DSH 插件工程化',
      }),
    ).toEqual({
      entityType: 'knowledge_document',
      id: 'kdoc_123:abc',
      label: 'DSH 插件工程化',
    });
  });

  it('does not infer entity context from list or nested review routes', () => {
    expect(
      surfaceDescriptorToContextEntity({ module: 'goal', route: '/goals', title: '目标' }),
    ).toBeNull();
    expect(
      surfaceDescriptorToContextEntity({
        module: 'goal',
        route: '/goals/goal-1/review/create',
        title: '复盘',
      }),
    ).toBeNull();
    expect(
      surfaceDescriptorToContextEntity({ module: 'note', route: '/repository', title: '知识' }),
    ).toBeNull();
  });
});
