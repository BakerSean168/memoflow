import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ProductSurfaceState from './ProductSurfaceState.vue';

const appRoot = resolve(import.meta.dirname, '../..');
const read = (relative: string) => readFileSync(resolve(appRoot, relative), 'utf8');

describe('product overlay and state recipes', () => {
  it('exposes collection, workspace, and dialog state families with stable semantics', () => {
    const loading = mount(ProductSurfaceState, {
      props: {
        family: 'workspace',
        kind: 'loading',
        title: 'Loading workspace',
      },
    });
    expect(loading.attributes('data-state-family')).toBe('workspace');
    expect(loading.attributes('aria-busy')).toBe('true');
    expect(loading.attributes('role')).toBe('status');

    const error = mount(ProductSurfaceState, {
      props: {
        family: 'collection',
        kind: 'error',
        title: 'Unable to load',
      },
    });
    expect(error.attributes('data-state-family')).toBe('collection');
    expect(error.attributes('role')).toBe('alert');

    const empty = mount(ProductSurfaceState, {
      props: {
        family: 'dialog',
        kind: 'empty',
        title: 'Nothing generated',
      },
    });
    expect(empty.attributes('data-state-family')).toBe('dialog');
    expect(empty.text()).toContain('Nothing generated');
  });

  it('keeps adopted compact property popovers on shared presentation recipes', () => {
    const popover = read('shared/components/ProductPopoverSurface.vue');
    const kr = read('modules/goal/components/GoalKeyResultDirectControls.vue');

    expect(popover).toContain("'compact-menu': 'w-44 p-1.5'");
    expect(popover).toContain("property: 'w-56 space-y-2 p-3'");
    expect(kr).toContain('<ProductPopoverSurface recipe="compact-menu">');
  });

  it('keeps inspect, config, and workspace dialog recipes explicit without moving owner behavior', () => {
    const shell = read('shared/components/ProductDialogShell.vue');
    const occurrence = read('modules/task/components/dialogs/TaskOccurrenceInspectDialog.vue');
    const krInspect = read('modules/goal/components/dialogs/GoalKeyResultInspectDialog.vue');
    const goal = read('modules/goal/components/dialogs/GoalDialog.vue');
    const task = read('modules/task/components/dialogs/TaskPlanDialog.vue');
    const routine = read('modules/routine/components/RoutineEditorDialog.vue');
    const schedule = read('modules/schedule/components/CreateScheduleDialog.vue');

    expect(shell).toContain("recipe?: 'form' | 'inspect' | 'config' | 'workspace'");
    expect(shell).toContain(':data-product-dialog-recipe="recipe"');
    expect(occurrence).toContain('recipe="inspect"');
    expect(krInspect).toContain('recipe="inspect"');
    expect(goal).toContain('recipe="workspace"');
    expect(task).toContain('recipe="workspace"');
    expect(routine).toContain('recipe="workspace"');
    expect(schedule).toContain('recipe="config"');
  });

  it('keeps narrow workspace sheets on one accessible surface recipe', () => {
    const sheet = read('shared/components/ProductSheetSurface.vue');
    const knowledge = read('modules/repository/views/KnowledgeProjectionWorkspaceView.vue');

    expect(sheet).toContain('data-product-sheet-recipe="narrow"');
    expect(sheet).toContain('<SheetHeader class="sr-only">');
    expect(sheet).toContain("sm: 'w-[min(88vw,22rem)]'");
    expect(sheet).toContain("md: 'w-[min(92vw,24rem)]'");
    expect(knowledge.match(/<ProductSheetSurface/g)?.length).toBe(2);
    expect(knowledge).toContain('test-id="knowledge-projection-catalog-sheet"');
    expect(knowledge).toContain('test-id="knowledge-projection-context-sheet"');
  });

  it('routes representative owner surfaces through the matching state family', () => {
    const documentState = read('modules/repository/components/DocumentWorkspaceState.vue');
    const notifications = read('modules/notification/views/NotificationListPage.vue');
    const taskAi = read('modules/task/components/TaskAIGenerationDialog.vue');

    expect(documentState).toContain('family="workspace"');
    expect(notifications.match(/family="collection"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(taskAi.match(/family="dialog"/g)?.length).toBe(2);
  });
});
