import { z } from 'zod';
import { CreateGoalSchema, GoalDraftCheckpointSnapshotSchema } from '@memoflow/contracts/goal';
import { expect, test } from '@playwright/test';
import { TIMEOUT_CONFIG, WEB_CONFIG } from '../../config';
import { registerAndLogin, loginViaApi } from '../../helpers/auth-api';
import {
  bootstrapGoalWorkflowSession,
  e2ePassword,
  generateTestEmail,
} from './goal-workflow.fixture';

test.describe('AI Goal Workflow', () => {
  test('[P0] isolates native checkpoints across logout and restores them after the original identity logs in again', async ({
    page,
  }) => {
    const firstEmail = generateTestEmail();
    const secondEmail = generateTestEmail();
    let creates = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/goals')
        creates++;
    });
    const openDraft = async () => {
      await page.goto(WEB_CONFIG.getFullUrl('/goals?goalForm=create'), {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByTestId('goal-name-input')).toBeEnabled({
        timeout: TIMEOUT_CONFIG.NAVIGATION,
      });
    };
    const logout = async () => {
      await page.goto(WEB_CONFIG.getFullUrl('/account/center'), { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('account-center-view')).toBeVisible({
        timeout: TIMEOUT_CONFIG.NAVIGATION,
      });
      await page.getByTestId('account-logout-button').click();
      const confirmation = page.getByRole('alertdialog', {
        name: /log out of your account|确认退出登录/i,
      });
      await confirmation.getByRole('button', { name: /log out|退出登录/i }).click();
      await page.waitForURL((url) => url.pathname.includes(WEB_CONFIG.LOGIN_PATH), {
        timeout: TIMEOUT_CONFIG.LOGIN,
      });
    };
    const goalSnapshot = async () => {
      const response = await page.request.get(`${new URL(page.url()).origin}/api/v1/goals`);
      expect(response.ok()).toBe(true);
      return z.object({ data: z.unknown() }).parse(await response.json()).data;
    };
    await registerAndLogin(page, { email: firstEmail, password: e2ePassword });
    const before = await goalSnapshot();
    await openDraft();
    await page.getByTestId('goal-name-input').fill('Identity A private checkpoint');
    await page
      .getByTestId('goal-description-input')
      .fill('Restored only for the original identity');
    await expect(page.getByTestId('goal-draft-checkpoint-status')).toContainText(
      /Draft preserved|草稿已在此设备保留/,
    );
    await logout();
    await registerAndLogin(page, { email: secondEmail, password: e2ePassword });
    await openDraft();
    await expect(page.getByTestId('goal-name-input')).toHaveValue('');
    await expect(page.getByTestId('goal-description-input')).toHaveValue('');
    await page.getByTestId('goal-name-input').fill('Identity B private checkpoint');
    await expect(page.getByTestId('goal-draft-checkpoint-status')).toContainText(
      /Draft preserved|草稿已在此设备保留/,
    );
    await logout();
    await loginViaApi(page, { email: firstEmail, password: e2ePassword });
    await openDraft();
    await expect(page.getByTestId('goal-name-input')).toHaveValue('Identity A private checkpoint');
    await expect(page.getByTestId('goal-description-input')).toHaveValue(
      'Restored only for the original identity',
    );
    expect(await goalSnapshot()).toEqual(before);
    expect(creates).toBe(0);
  });

  test('[P0] restores a native Goal checkpoint after refresh and saves its stable intention once', async ({
    page,
  }) => {
    const telemetry = await bootstrapGoalWorkflowSession(page, {
      landingPath: '/goals?goalForm=create',
      expectAiVisible: false,
    });
    const panel = page.getByTestId('goal-panel-form');
    await expect(panel).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(panel.getByTestId('goal-name-input')).toBeEnabled();
    await panel.getByTestId('goal-name-input').fill('Checkpoint draft');
    await panel.getByTestId('goal-description-input').fill('Human text survives refresh.');
    await expect(panel.getByTestId('goal-draft-checkpoint-status')).toContainText(
      /Draft preserved|草稿已在此设备保留/,
      { timeout: TIMEOUT_CONFIG.ELEMENT_WAIT },
    );
    expect(telemetry.ownerGoalCreateCount).toBe(0);
    const before = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('memoflow-goal-drafts', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<unknown>((resolve, reject) => {
          const request = db.transaction('checkpoints').objectStore('checkpoints').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    });
    const checkpoints = z.array(GoalDraftCheckpointSnapshotSchema).parse(before);
    const checkpoint = checkpoints.find((item) => item.content?.draft.name === 'Checkpoint draft');
    expect(checkpoint?.content?.draft.description).toBe('Human text survives refresh.');
    const createId = checkpoint!.content!.createId;
    const peer = await page.context().newPage();
    try {
      await peer.goto(WEB_CONFIG.getFullUrl('/goals?goalForm=create'), {
        waitUntil: 'domcontentloaded',
      });
      const other = peer.getByTestId('goal-panel-form');
      await expect(other.getByTestId('goal-name-input')).toHaveValue('Checkpoint draft', {
        timeout: TIMEOUT_CONFIG.NAVIGATION,
      });
      await panel.getByTestId('goal-name-input').fill('First window wins');
      await expect(panel.getByTestId('goal-draft-checkpoint-status')).toContainText(
        /Draft preserved|草稿已在此设备保留/,
      );
      await other.getByTestId('goal-name-input').fill('Second window draft');
      await expect(other.getByTestId('goal-draft-checkpoint-status')).toContainText(
        /Another window|另一窗口/,
      );
      await expect(other.getByTestId('goal-name-input')).toHaveValue('Second window draft');
      await expect(other.getByTestId('save-goal-button')).toBeDisabled();
      await other
        .getByRole('button', { name: /Load the preserved draft|加载已保留的草稿/ })
        .click();
      await expect(other.getByTestId('goal-name-input')).toHaveValue('First window wins');
    } finally {
      await peer.close();
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(panel).toBeVisible({ timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(panel.getByTestId('goal-name-input')).toHaveValue('First window wins');
    await expect(panel.getByTestId('goal-description-input')).toHaveValue(
      'Human text survives refresh.',
    );
    await expect(panel.getByTestId('goal-name-input')).toBeEnabled();
    await panel.getByTestId('goal-name-input').fill('Recovered human draft');
    // Commit on the actual API, then lose the response. Recovery must read that
    // same intention rather than issue another create.
    let committed = false;
    await page.route('**/api/v1/goals', async (route) => {
      if (route.request().method() !== 'POST' || committed) {
        await route.fallback();
        return;
      }
      const body = CreateGoalSchema.parse(route.request().postDataJSON());
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      committed = true;
      telemetry.ownerGoalCreateCount++;
      telemetry.lastOwnerGoalCreateBody = body;
      await route.abort('failed');
    });
    await panel.getByTestId('save-goal-button').click();
    await expect.poll(() => committed).toBe(true);
    await expect(panel).toBeHidden({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    expect(telemetry.ownerGoalCreateCount).toBe(1);
    expect(telemetry.lastOwnerGoalCreateBody).toMatchObject({
      id: createId,
      name: 'Recovered human draft',
    });
    expect(telemetry.lastOwnerGoalCreateBody).not.toHaveProperty('nativeAiLease');
    expect(telemetry.goalAgentStartCount).toBe(0);
  });
});
