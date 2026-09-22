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

    await page.getByTestId('routine-create-profile-button').click();
    await expect(page.getByTestId('routine-profile-dialog')).toBeVisible();
    await page.getByTestId('routine-profile-name-input').fill(profileName);
    await page.getByTestId('routine-profile-save').click();
    await expect(page.getByTestId('routine-profile-dialog')).toBeHidden();

    const profile = page
      .locator('div[data-testid^="routine-profile-"]')
      .filter({ hasText: profileName })
      .first();
    await expect(profile).toBeVisible();
    const profileTestId = await profile.getAttribute('data-testid');
    expect(profileTestId).toBeTruthy();
    const profileId = profileTestId!.replace('routine-profile-', '');

    await page.getByTestId('routine-create-button').click();
    await expect(page.getByTestId('routine-editor-dialog')).toBeVisible();
    await page.getByTestId('routine-name-input').fill(routineName);
    await page.getByTestId('routine-trigger-type').selectOption('WallClock');
    await page.locator('#routine-local-time').fill('09:15');
    await page.getByTestId(`routine-profile-membership-${profileId}`).check();
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
    const toggle = page.getByTestId(`routine-toggle-${routineId}`);

    await expect(toggle).toHaveAttribute('data-state', 'checked');
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-state', 'unchecked');
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-state', 'checked');

    await page.getByTestId(`routine-edit-${routineId}`).click();
    await expect(page.getByTestId('routine-editor-dialog')).toBeVisible();
    await page.getByTestId('routine-name-input').fill(updatedRoutineName);
    await page.locator('#routine-local-time').fill('10:30');
    await expect(page.getByTestId(`routine-profile-membership-${profileId}`)).toBeChecked();
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
    await expect(page.getByTestId(`routine-profile-${profileId}`)).toContainText(profileName);

    await page.getByTestId('routine-method-use-stand-and-move').click();
    await expect(page.getByTestId('routine-editor-dialog')).toBeVisible();
    await expect(page.getByTestId('routine-name-input')).toHaveValue('Stand & Move');
    await expect(page.getByTestId('routine-trigger-type')).toHaveValue('Elapsed');
    await page.getByTestId('routine-editor-cancel').click();
    await expect(page.getByTestId('routine-editor-dialog')).toBeHidden();

    page.once('dialog', async (dialog) => dialog.accept());
    await page.getByTestId(`routine-delete-${routineId}`).click();
    await expect(page.getByTestId(`routine-card-${routineId}`)).toHaveCount(0);

    page.once('dialog', async (dialog) => dialog.accept());
    await page.getByTestId(`routine-profile-delete-${profileId}`).click();
    await expect(page.getByTestId(`routine-profile-${profileId}`)).toHaveCount(0);
  });
});
