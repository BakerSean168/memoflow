import { test } from './fixtures/sync-fixture';
import {
  createGoal,
  deleteGoal,
  editGoal,
  openGoalList,
  waitForGoalHidden,
  waitForGoalVisible,
} from './helpers/goal';

function uniqueGoalName(prefix: string, suffix: string): string {
  return `E2E Sync ${prefix} ${suffix} ${Date.now()}`;
}

test.describe('desktop/web goal sync regression', () => {
  test('syncs desktop create, edit, and delete to web', async ({
    desktop,
    trackGoal,
    webPage,
  }, testInfo) => {
    const originalName = trackGoal(uniqueGoalName('desktop-source', `${testInfo.parallelIndex}`));
    const updatedName = trackGoal(uniqueGoalName('desktop-updated', `${testInfo.parallelIndex}`));

    await createGoal(desktop.page, 'desktop', {
      name: originalName,
      description: 'created on desktop and asserted on web',
    });
    await waitForGoalVisible(webPage, 'web', originalName);

    await editGoal(desktop.page, originalName, {
      name: updatedName,
      description: 'edited on desktop and asserted on web',
    });
    await waitForGoalVisible(webPage, 'web', updatedName);
    await waitForGoalHidden(webPage, 'web', originalName);

    await deleteGoal(desktop.page, updatedName);
    await waitForGoalHidden(webPage, 'web', updatedName);
  });

  test('syncs web create, edit, and delete to desktop', async ({
    desktop,
    trackGoal,
    webPage,
  }, testInfo) => {
    const originalName = trackGoal(uniqueGoalName('web-source', `${testInfo.parallelIndex}`));
    const updatedName = trackGoal(uniqueGoalName('web-updated', `${testInfo.parallelIndex}`));

    await openGoalList(desktop.page, 'desktop');
    await createGoal(webPage, 'web', {
      name: originalName,
      description: 'created on web and asserted on desktop',
    });
    await waitForGoalVisible(desktop.page, 'desktop', originalName);

    await editGoal(webPage, originalName, {
      name: updatedName,
      description: 'edited on web and asserted on desktop',
    });
    await waitForGoalVisible(desktop.page, 'desktop', updatedName);
    await waitForGoalHidden(desktop.page, 'desktop', originalName);

    await deleteGoal(webPage, updatedName);
    await waitForGoalHidden(desktop.page, 'desktop', updatedName);
  });

  test('keeps synced goals after restarting desktop', async ({
    desktop,
    trackGoal,
    webPage,
  }, testInfo) => {
    const goalName = trackGoal(uniqueGoalName('desktop-restart', `${testInfo.parallelIndex}`));

    await createGoal(desktop.page, 'desktop', {
      name: goalName,
      description: 'used to verify desktop persistence after restart',
    });
    await waitForGoalVisible(webPage, 'web', goalName);

    await desktop.restart();
    await openGoalList(desktop.page, 'desktop');
    await waitForGoalVisible(desktop.page, 'desktop', goalName);
  });
});
