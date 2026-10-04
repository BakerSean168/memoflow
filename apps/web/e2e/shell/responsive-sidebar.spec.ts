import { expect, test } from '@playwright/test';
import { registerAndLogin } from '../helpers/testHelpers';

const password = 'Test123456!';

test.describe('Shell responsive conversation sidebar', () => {
  test('[P1] preserves the desktop preference while narrow navigation becomes an overlay Sheet', async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await page.setViewportSize({ width: 1280, height: 820 });
    await registerAndLogin(page, {
      email: `shell-responsive-${suffix}@test.com`,
      password,
      landingPath: '/',
    });

    const toggle = page.getByTestId('shell-sidebar-toggle');
    const sidebarHost = page.getByTestId('shell-sidebar-pane-host');
    const workspaceMain = page.getByTestId('shell-workspace-main');

    await expect(sidebarHost).toHaveAttribute('data-sidebar-presentation', 'docked');
    await expect(page.getByTestId('conversation-sidebar-resizer')).toBeVisible();

    // Persist a desktop preference: sidebar collapsed.
    await toggle.click();
    await expect(sidebarHost).toHaveCount(0);

    await page.setViewportSize({ width: 900, height: 820 });
    await expect(sidebarHost).toHaveCount(0);

    const widthBeforeOverlay = (await workspaceMain.boundingBox())?.width;
    expect(widthBeforeOverlay).toBeGreaterThan(0);

    // Narrow mode must remain accessible through a modal navigation drawer.
    await toggle.click();
    await expect(sidebarHost).toHaveAttribute('data-sidebar-presentation', 'overlay');
    await expect(sidebarHost).toHaveAttribute('role', 'dialog');
    await expect(page.getByTestId('conversation-sidebar-resizer')).toHaveCount(0);

    const widthWithOverlay = (await workspaceMain.boundingBox())?.width;
    expect(widthWithOverlay).toBe(widthBeforeOverlay);

    await page.keyboard.press('Escape');
    await expect(sidebarHost).toHaveCount(0);

    // Re-open, then resize to desktop while open. Transient overlay state must
    // disappear without overwriting the persisted collapsed desktop preference.
    await toggle.click();
    await expect(sidebarHost).toHaveAttribute('data-sidebar-presentation', 'overlay');
    await page.setViewportSize({ width: 1280, height: 820 });
    await expect(sidebarHost).toHaveCount(0);

    // One explicit desktop toggle should restore the docked sidebar.
    await toggle.click();
    await expect(sidebarHost).toHaveAttribute('data-sidebar-presentation', 'docked');
    await expect(page.getByTestId('conversation-sidebar-resizer')).toBeVisible();
  });
});
