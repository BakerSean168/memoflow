import { expect, test } from '@playwright/test';
import { TIMEOUT_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const password = 'Test123456!';

test.use({ timezoneId: 'UTC' });

test.describe('Routine authenticated product journey', () => {
  test('[RUI-2502][RAE-2702] authenticated owner-backed Routine CRUD survives refresh', async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const profileName = `Work Profile ${suffix}`;
    const routineName = `Daily Reset ${suffix}`;
    const updatedRoutineName = `Daily Reset Updated ${suffix}`;

    await registerAndLogin(page, {
      email: `routine-auth-${suffix}@test.com`,
      password,
      landingPath: '/',
    });

    await page.getByTestId('capsule-nav-routine').click();
    await page.waitForURL(/\/routines$/, { timeout: TIMEOUT_CONFIG.NAVIGATION });
    await expect(page.getByTestId('routine-configuration-center')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });

    await page.getByTestId('routine-profile-filter').click();
    await page.getByTestId('routine-create-profile-button').click();
    await expect(page.getByTestId('routine-profile-dialog')).toBeVisible();
    await page.getByTestId('routine-profile-name-input').fill(profileName);
    await page.getByTestId('routine-profile-save').click();
    await expect(page.getByTestId('routine-profile-dialog')).toBeHidden();

    await page.getByTestId('routine-profile-filter').click();
    const profile = page
      .locator('[data-testid^="routine-profile-"]')
      .filter({ hasText: profileName })
      .first();
    await expect(profile).toBeVisible();
    const profileTestId = await profile.getAttribute('data-testid');
    expect(profileTestId).toBeTruthy();
    const profileId = profileTestId!.replace('routine-profile-', '');
    await profile.click();

    await page.getByTestId('routine-create-button').click();
    await page.getByTestId('routine-create-blank').click();
    await expect(page.getByTestId('routine-editor-dialog')).toBeVisible();
    await page.getByTestId('routine-name-input').fill(routineName);
    await page.getByTestId('routine-trigger-type').click();
    await page.getByTestId('routine-trigger-option-WallClock').click();
    await page.getByTestId('routine-local-time-hour').fill('09');
    await page.getByTestId('routine-local-time-minute').fill('15');
    await page.getByTestId('routine-profile-picker').click();
    await page.getByTestId(`routine-profile-membership-${profileId}`).click();
    await page.keyboard.press('Escape');
    await page.getByTestId('routine-editor-save').click();
    await expect(page.getByTestId('routine-editor-dialog')).toBeHidden();

    const createdCard = page
      .locator('article[data-testid^="routine-card-"]')
      .filter({ hasText: routineName })
      .first();
    await expect(createdCard).toBeVisible({ timeout: TIMEOUT_CONFIG.ELEMENT_WAIT });
    await expect(createdCard).toContainText(profileName);
    await expect(createdCard).toContainText('09:15');

    const routineTestId = await createdCard.getAttribute('data-testid');
    expect(routineTestId).toBeTruthy();
    const routineId = routineTestId!.replace('routine-card-', '');

    // A dirty edit must survive an accidental backdrop click until the user
    // explicitly confirms that the draft can be discarded.
    const dirtyRoutineName = `Unsaved Routine ${suffix}`;
    await createdCard.locator('button').first().click();
    await expect(page.getByTestId('routine-editor-dialog')).toBeVisible();
    await page.getByTestId('routine-name-input').fill(dirtyRoutineName);
    await page.mouse.click(8, 8);
    await expect(page.getByTestId('global-confirm-dialog')).toBeVisible();
    await page.getByTestId('global-confirm-cancel').click();
    await expect(page.getByTestId('global-confirm-dialog')).toBeHidden();
    await expect(page.getByTestId('routine-editor-dialog')).toBeVisible();
    await expect(page.getByTestId('routine-name-input')).toHaveValue(dirtyRoutineName);

    await page.mouse.click(8, 8);
    await expect(page.getByTestId('global-confirm-dialog')).toBeVisible();
    await page.getByTestId('global-confirm-confirm').click();
    await expect(page.getByTestId('routine-editor-dialog')).toBeHidden();
    await expect(createdCard).toContainText(routineName);
    await expect(createdCard).not.toContainText(dirtyRoutineName);

    const toggle = page.getByTestId(`routine-toggle-${routineId}`);
    await expect(toggle).toHaveAttribute('data-state', 'checked');
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-state', 'unchecked');
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-state', 'checked');

    await createdCard.locator('button').first().click();
    await expect(page.getByTestId('routine-editor-dialog')).toBeVisible();
    await page.getByTestId('routine-name-input').fill(updatedRoutineName);
    await page.getByTestId('routine-local-time-hour').fill('10');
    await page.getByTestId('routine-local-time-minute').fill('30');
    await page.getByTestId('routine-profile-picker').click();
    await expect(page.getByTestId(`routine-profile-membership-${profileId}`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.keyboard.press('Escape');
    await page.getByTestId('routine-editor-save').click();
    await expect(page.getByTestId('routine-editor-dialog')).toBeHidden();

    const updatedCard = page.getByTestId(`routine-card-${routineId}`);
    await expect(updatedCard).toContainText(updatedRoutineName);
    await expect(updatedCard).toContainText('10:30');
    await expect(updatedCard).toContainText(profileName);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('routine-configuration-center')).toBeVisible({
      timeout: TIMEOUT_CONFIG.NAVIGATION,
    });
    await expect(page.getByTestId(`routine-card-${routineId}`)).toContainText(updatedRoutineName);
    await page.getByTestId('routine-profile-filter').click();
    await expect(page.getByTestId(`routine-profile-${profileId}`)).toContainText(profileName);
    await page.getByTestId(`routine-profile-${profileId}`).click();

    await page.getByTestId('routine-create-button').click();
    await page.getByTestId('routine-template-stand-and-move').click();
    await expect(page.getByTestId('routine-editor-dialog')).toBeVisible();
    await expect(page.getByTestId('routine-name-input')).toHaveValue(/Stand & Move|起身活动/);
    await expect(page.getByTestId('routine-trigger-type')).toHaveAttribute(
      'data-trigger-type',
      'Elapsed',
    );
    await page.getByTestId('routine-editor-cancel').click();
    await expect(page.getByTestId('routine-editor-dialog')).toBeHidden();

    await page.getByTestId(`routine-more-${routineId}`).click();
    page.once('dialog', async (dialog) => dialog.accept());
    await page.getByTestId(`routine-delete-${routineId}`).click();
    await expect(page.getByTestId(`routine-card-${routineId}`)).toHaveCount(0);

    await page.getByTestId('routine-profile-filter').click();
    page.once('dialog', async (dialog) => dialog.accept());
    await page.getByTestId(`routine-profile-delete-${profileId}`).click();
    await expect(page.getByTestId(`routine-profile-${profileId}`)).toHaveCount(0);
  });
});
