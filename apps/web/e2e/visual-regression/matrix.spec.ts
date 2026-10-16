import { expect, test, type Locator } from '@playwright/test';
import { matrix, validateMatrix } from './manifest.mjs';
import { openVisualCase, waitForVisualLayout } from './environment';
validateMatrix(matrix);

// #459 acceptance exercises production owners with deterministic injected ports.
// It proves browser behavior and geometry, not authenticated backend delivery.
for (const theme of ['light', 'dark'] as const) {
  for (const width of [440, 840, 1280, 1600]) {
    for (const owner of ['goal', 'task', 'routine', 'schedule'] as const) {
      test(`#459 ${owner} pane ${width}px ${theme}`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const configurations = {
          goal: {
            owner: 'goal',
            query: 'surface=collection',
            create: 'create-goal-entry',
            editor: 'goal-panel-form',
            input: 'goal-name-input',
            save: 'save-goal-button',
            toolbar: 'goal-page-toolbar',
          },
          task: {
            owner: 'pages',
            query: 'surface=shell-focus&acceptance=459&failCreate=1',
            create: 'create-task-plan-button',
            editor: 'task-plan-dialog',
            input: 'task-plan-title-input',
            save: 'task-dialog-save-button',
            toolbar: 'task-page-toolbar',
          },
          routine: {
            owner: 'pages',
            query: 'surface=routine&acceptance=459&failCreate=1',
            create: 'routine-create-button',
            editor: 'routine-editor-dialog',
            input: 'routine-name-input',
            save: 'routine-editor-save',
            toolbar: 'routine-list-toolbar',
          },
          schedule: {
            owner: 'schedule',
            query: 'surface=crud',
            create: 'create-schedule-button',
            editor: 'schedule-dialog',
            input: 'schedule-title-input',
            save: 'schedule-save-button',
            toolbar: 'schedule-page-toolbar',
          },
        };
        const config = configurations[owner];
        const external = await openVisualCase(page, {
          owner: config.owner,
          clock: 'running',
          theme,
          locale: 'zh-CN',
          width: 'wide',
          query: `${config.query}&panelWidth=${width}`,
        });
        await page.setViewportSize({ width, height: 900 });
        const create = page.getByTestId(config.create);
        await expect(create).toBeVisible();
        const createBox = (await create.boundingBox())!;
        expect(createBox.width).toBe(32);
        expect(createBox.height).toBe(32);
        await expect(create).toHaveAccessibleName(/.+/);
        await create.click();
        if (owner === 'routine') await page.getByTestId('routine-create-blank').click();
        const editor = page.getByTestId(config.editor);
        const input = page.getByTestId(config.input);
        await expect(editor).toHaveAttribute('aria-modal', 'false');
        await expect(input).toBeFocused();
        expect(
          await page.getByTestId(config.toolbar).evaluate((el) => (el as HTMLElement).inert),
        ).toBe(true);
        const footer = editor.locator('footer');
        const geometry = async (locator: Locator) => {
          const box = (await locator.boundingBox())!;
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        };
        const before = await geometry(editor);
        const footerBefore = await geometry(footer);
        const inputBefore = await geometry(input);
        expect(before.x).toBeGreaterThanOrEqual(0);
        expect(before.x + before.width).toBeLessThanOrEqual(width);
        expect(before.height).toBeGreaterThan(400);
        expect(footerBefore.y + footerBefore.height).toBeLessThanOrEqual(before.y + before.height);
        expect(
          await editor
            .locator('[data-scroll-host="pane-dialog"]')
            .evaluate((el) => getComputedStyle(el).overflowY),
        ).toBe('auto');
        await expect(input).not.toHaveAttribute('aria-invalid', 'true');
        await page.keyboard.press('Tab');
        await expect(input).toHaveAttribute('aria-invalid', 'true');
        await expect(editor.getByRole('alert').first()).toBeVisible();
        expect(await geometry(editor)).toEqual(before);
        expect(await geometry(footer)).toEqual(footerBefore);
        expect(await geometry(input)).toEqual(inputBefore);
        await page.keyboard.press('Shift+Tab');
        await expect(input).toBeFocused();
        expect(await input.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
        const draft = `验收 ${owner} ${width}`;
        await input.fill(draft);
        await expect(input).not.toHaveAttribute('aria-invalid', 'true');
        await expect(editor.getByRole('alert')).toHaveCount(0);
        expect(await geometry(footer)).toEqual(footerBefore);

        if (owner === 'task') {
          await page.getByTestId('task-schedule-chip').click();
          await expect(page.getByTestId('task-schedule-popover')).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(page.getByTestId('task-schedule-popover')).toBeHidden();
          await expect(editor).toBeVisible();
        }
        if (owner === 'routine') {
          await page.getByTestId('routine-trigger-type').click();
          expect(
            await page.locator('body').evaluate((el) => getComputedStyle(el).pointerEvents),
          ).not.toBe('none');
          await page.keyboard.press('Escape');
          await expect(editor).toBeVisible();
        }

        if (owner === 'schedule') {
          const start = page.getByTestId('schedule-start-time-button');
          await start.click();
          const picker = page.getByTestId('schedule-start-date-time-picker');
          await expect(picker).toBeVisible();
          expect((await picker.boundingBox())!.width).toBeLessThanOrEqual(368);
          const hour = picker.getByRole('textbox', { name: '小时', exact: true });
          await expect(hour).toBeFocused();
          const pickerBefore = await geometry(picker);
          const pickerFooterBefore = await geometry(picker.locator('footer'));
          expect(await editor.evaluate((el) => !!el.closest('[inert]'))).toBe(true);
          await hour.fill('99');
          await expect(hour).toHaveAttribute('aria-invalid', 'true');
          await expect(picker.getByRole('alert')).toBeVisible();
          expect(await geometry(picker)).toEqual(pickerBefore);
          expect(await geometry(picker.locator('footer'))).toEqual(pickerFooterBefore);
          await expect(hour).toBeFocused();
          await page.keyboard.press('Escape');
          await expect(picker).toBeHidden();
          await expect(start).toBeFocused();
          await expect(input).toHaveValue(draft);
          // Reopening discards the invalid clock draft; keyboard adjustment applies once.
          await start.click();
          await expect(hour).not.toHaveValue('99');
          await page.keyboard.press('ArrowUp');
          await picker.getByRole('button', { name: '确认', exact: true }).click();
          await expect(picker).toBeHidden();
          await expect(start).toBeFocused();
          await page.getByRole('switch', { name: '全天' }).click();
          await page.getByTestId('schedule-start-date').click();
          const query = page.getByTestId('schedule-start-date-query');
          await query.fill('not a date');
          await page.keyboard.press('Enter');
          await expect(query).toHaveAttribute('aria-invalid', 'true');
          await page.keyboard.press('Escape');
          await expect(editor).toBeVisible();
        }

        await editor.screenshot({ path: testInfo.outputPath(`${owner}-${width}-${theme}.png`) });
        await input.focus();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('global-confirm-cancel')).toBeVisible();
        await page.getByTestId('global-confirm-cancel').click();
        await expect(input).toHaveValue(draft);
        await page.getByTestId(config.save).click();
        if (owner === 'task' || owner === 'routine') {
          await expect(page.getByTestId(`${owner}-submit-error`)).toBeVisible();
          await expect(input).toHaveValue(draft);
          await page.getByTestId(config.save).click();
        }
        await expect(editor).toBeHidden();
        if (owner === 'task' || owner === 'routine') {
          const evidence = await page.evaluate(() =>
            (
              window as unknown as {
                scopedEditorEvidence: () => { writes: { owner: string; name: string }[] };
              }
            ).scopedEditorEvidence(),
          );
          expect(evidence.writes).toEqual([
            { owner, name: draft },
            { owner, name: draft },
          ]);
        }
        await create.click();
        if (owner === 'routine') await page.getByTestId('routine-create-blank').click();
        await expect(input).toHaveValue('');
        await page.keyboard.press('Escape');
        await expect(editor).toBeHidden();
        await expect(create).toBeFocused();
        expect(errors).toEqual([]);
        expect(external).toEqual([]);
      });
    }
  }
}
for (const theme of ['light', 'dark'] as const) {
  for (const width of [440, 1280]) {
    test(`#459 QuickTask and RoutineProfile pane entries ${width}px ${theme}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await openVisualCase(page, {
        owner: 'pages',
        clock: 'running',
        theme,
        locale: 'en-US',
        width: 'wide',
        query: 'surface=shell-focus&acceptance=459',
      });
      await page.setViewportSize({ width, height: 900 });
      await page.getByTestId('business-panel-home').click();
      await page.getByTestId('today-overview-create-task').click();
      const quick = page.getByTestId('quick-task-dialog');
      await expect(quick).toHaveAttribute('aria-modal', 'false');
      const title = quick.getByTestId('quick-task-title-input');
      await expect(title).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(title).toHaveAttribute('aria-invalid', 'true');
      await title.fill('Quick task from Home');
      page.once('dialog', (dialog) => dialog.dismiss());
      await page.getByTestId('business-panel-home').click();
      await expect(title).toHaveValue('Quick task from Home');
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByTestId('business-panel-home').click();
      await expect(page.getByTestId('today-overview-panel')).toBeVisible();
      await page.locator('[data-business-tab-id]').first().click();
      await expect(title).toHaveValue('Quick task from Home');
      await quick.getByTestId('quick-task-save-button').click();
      await expect(quick).toBeHidden();
      await expect(page.getByTestId('create-task-plan-button')).toBeFocused();

      await page.getByTestId('capsule-nav-routine').click();
      await page.getByTestId('routine-profile-filter').click();
      expect(
        await page.locator('body').evaluate((el) => getComputedStyle(el).pointerEvents),
      ).not.toBe('none');
      await page.getByTestId('routine-create-profile-button').click();
      const profile = page.getByTestId('routine-profile-dialog');
      await expect(profile).toHaveAttribute('aria-modal', 'false');
      const name = profile.getByTestId('routine-profile-name-input');
      await expect(name).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await name.fill('Profile from business pane');
      page.once('dialog', (dialog) => dialog.dismiss());
      await page.getByTestId('business-panel-home').click();
      await expect(name).toHaveValue('Profile from business pane');
      page.once('dialog', (dialog) => dialog.accept());
      await page.getByTestId('business-panel-home').click();
      await expect(page.getByTestId('today-overview-panel')).toBeVisible();
      await page
        .getByTestId('business-panel-tab-list')
        .getByRole('button', { name: 'Routines', exact: true })
        .click();
      await expect(name).toHaveValue('Profile from business pane');
      await profile.getByTestId('routine-profile-save').click();
      await expect(profile).toBeHidden();
      await expect(page.getByTestId('routine-profile-filter')).toBeFocused();
      const evidence = await page.evaluate(() =>
        (
          window as unknown as {
            scopedEditorEvidence: () => { writes: { owner: string; name: string }[] };
          }
        ).scopedEditorEvidence(),
      );
      expect(evidence.writes).toEqual([
        { owner: 'task', name: 'Quick task from Home' },
        { owner: 'profile', name: 'Profile from business pane' },
      ]);
      expect(errors).toEqual([]);
    });
  }
  test(`#459 Chat, Focus, Home and settings preserve the active Task draft (${theme})`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const external = await openVisualCase(page, {
      owner: 'pages',
      clock: 'running',
      theme,
      locale: 'en-US',
      width: 'wide',
      query: 'surface=shell-split&acceptance=459',
    });
    await page.getByTestId('create-task-plan-button').click();
    const title = page.getByTestId('task-plan-title-input');
    await title.fill('Draft survives workspace actions');
    const composer = page.getByTestId('ai-chat-composer');
    await expect(composer).toBeEnabled();
    await composer.fill('Chat remains available');
    await expect(title).toHaveValue('Draft survives workspace actions');

    await page.getByTestId('shell-sidebar-toggle').click();
    const sidebar = page.getByTestId('conversation-sidebar').filter({ visible: true });
    await expect(sidebar).toBeVisible();
    await sidebar.getByTestId('conversation-search-toggle').click();
    const search = sidebar.getByTestId('conversation-search-input');
    await expect(search).toBeFocused();
    const searchBox = (await search.boundingBox())!;
    const newBox = (await sidebar.getByTestId('shell-new-conversation').boundingBox())!;
    expect(Math.abs(searchBox.y - newBox.y)).toBeLessThanOrEqual(1);
    expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(newBox.x);
    await search.fill('conversation-b');
    await expect(sidebar.locator('[data-keyboard-item]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(sidebar.getByTestId('conversation-search-toggle')).toBeFocused();
    await sidebar.locator('[data-keyboard-item="conversation-b"]').click();
    await expect(title).toHaveValue('Draft survives workspace actions');
    await sidebar.getByTestId('shell-new-conversation').click();
    await expect(title).toHaveValue('Draft survives workspace actions');

    await page.getByTestId('business-panel-focus-toggle').click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-shell-state', 'focus');
    await expect(title).toHaveValue('Draft survives workspace actions');
    await page.getByTestId('business-panel-focus-toggle').click();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByTestId('business-panel-home').click();
    await expect(title).toHaveValue('Draft survives workspace actions');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('business-panel-home').click();
    await expect(page.getByTestId('today-overview-panel')).toBeVisible();
    // The upper header owns the create actions; the Goal widget has no duplicate CTA.
    await expect(
      page.getByTestId('goal-progress-widget').getByRole('button', { name: /new goal/i }),
    ).toHaveCount(0);
    await page.locator('[data-business-tab-id]').first().click();
    await expect(title).toHaveValue('Draft survives workspace actions');

    const account = sidebar.getByTestId('shell-account-menu');
    const accountBox = (await account.boundingBox())!;
    await account.click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('shell-open-settings').click();
    await expect(page.getByTestId('settings-navigation-footer')).toBeVisible();
    const footer = (await page.getByTestId('settings-navigation-footer').boundingBox())!;
    expect(footer.height).toBe(44);
    expect(accountBox.y).toBeGreaterThanOrEqual(footer.y);
    expect(accountBox.y + accountBox.height).toBeLessThanOrEqual(footer.y + footer.height);
    await page.screenshot({ path: testInfo.outputPath(`settings-footer-${theme}.png`) });
    await page.getByTestId('settings-return-to-app').click();
    await expect(title).toHaveValue('Draft survives workspace actions');
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
}

for (const host of ['web', 'desktop'] as const) {
  for (const entry of matrix) {
    test(`${host}: ${entry.id}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      const externalRequests = await openVisualCase(page, { ...entry, host });
      await expect(page.getByTestId(entry.ready))
        .toBeVisible({ timeout: 10_000 })
        .catch((error: Error) => {
          throw new Error(`${error.message}\nFixture errors: ${errors.join('; ')}`);
        });
      switch (entry.surface) {
        case 'specialized.ai-native':
          await expect(page.getByTestId('task-plan-dialog')).toBeHidden();
          await page.getByTestId('task-open-native-review').click();
          await expect(page.getByTestId('task-plan-dialog')).toBeVisible();
          await expect(page.getByTestId('task-plan-title-input')).toHaveValue(
            'Review measured progress',
          );
          break;
        case 'overlay.goal-record':
          await page.getByTestId('goal-quick-check-in-kr-0').click();
          await expect(page.getByTestId('goal-record-dialog')).toBeVisible();
          await page.locator('#change-amount').fill('2');
          break;
        case 'overlay.goal-kr':
          await page
            .getByTestId('goal-kr-summary-kr-0')
            .getByRole('button', { name: '更多', exact: true })
            .click();
          await page.getByTestId('goal-kr-detail-kr-0').click();
          await expect(page.getByTestId('goal-kr-inspect')).toBeVisible();
          break;
        case 'overlay.task-inspect':
          await page.getByTestId('task-occurrence-body').click();
          await expect(page.getByTestId('task-occurrence-inspect')).toBeVisible();
          break;
        case 'overlay.task-measurement':
          await page.getByTestId('schedule-event-task-task-occurrence-1').focus();
          await page.keyboard.press('Enter');
          await expect(
            page.getByTestId(
              entry.width === 'narrow' ? 'planner-event-sheet' : 'planner-event-dialog',
            ),
          ).toBeVisible();
          if (entry.surface === 'overlay.task-measurement') {
            await page.getByTestId('task-compact-complete-task-occurrence-1').click();
            await expect(page.getByTestId('task-completion-measurement-dialog')).toBeVisible();
            await page.locator('#change-amount').fill('3');
          }
          break;
        case 'overlay.routine-editor':
          await page.getByTestId('routine-create-button').click();
          await page.getByTestId('routine-create-blank').click();
          await expect(page.getByTestId('routine-editor-dialog')).toBeVisible();
          break;
      }
      if (entry.surface.startsWith('shell.')) {
        await expect(page.getByTestId('app-shell')).toHaveAttribute(
          'data-shell-state',
          entry.surface === 'shell.focus' ? 'focus' : 'split',
        );
        await expect(page.getByTestId('business-panel')).toBeVisible();
        if (entry.surface === 'shell.narrow') {
          const box = await page.getByTestId('business-panel').boundingBox();
          expect(box!.width).toBeCloseTo(520, 0);
        }
        if (entry.surface === 'shell.capsules') {
          await page.getByTestId('capsule-schedule').hover();
          await expect(page.getByTestId('capsule-preview-schedule')).toBeVisible();
        }
      }
      await waitForVisualLayout(page);
      expect(errors).toEqual([]);
      expect(externalRequests).toEqual([]);
      await expect(page).toHaveScreenshot(`${entry.id}.png`);
      expect(errors).toEqual([]);
      expect(externalRequests).toEqual([]);
    });
  }
}

test('post-vNext chat header aligns with the business tab strip', async ({ page }) => {
  const entry = matrix.find((entry) => entry.surface === 'shell.split')!;
  await openVisualCase(page, entry);
  await expect(page.getByTestId('business-panel')).toBeVisible({ timeout: 10_000 });
  await waitForVisualLayout(page);

  const chatHeader = await page.getByTestId('ai-chat-header').boundingBox();
  const businessTabs = await page.getByTestId('business-panel-tab-strip').boundingBox();
  expect(chatHeader).not.toBeNull();
  expect(businessTabs).not.toBeNull();
  expect(chatHeader!.height).toBeCloseTo(businessTabs!.height, 0);
  expect(chatHeader!.y + chatHeader!.height).toBeCloseTo(businessTabs!.y + businessTabs!.height, 0);
});

test('UI-9002 narrow shell target, keyboard and scroll ownership', async ({ page }) => {
  const entry = matrix.find((entry) => entry.surface === 'shell.narrow')!;
  await openVisualCase(page, { ...entry, query: `${entry.query}&tabs=8` });
  await expect(page.getByTestId('business-panel')).toBeVisible();
  await waitForVisualLayout(page);
  const panel = page.getByTestId('business-panel');
  expect((await panel.boundingBox())!.width).toBeCloseTo(520, 0);
  // The workbench is a labelled button group, not an ARIA tablist: each
  // workbench item contains both an activation button and a close button.
  // Requiring role=tab would regress the accessible structure fixed in V2.
  const tabList = panel.getByTestId('business-panel-tab-list');
  await expect(tabList).toHaveAttribute('role', 'group');
  await expect(tabList).toHaveAccessibleName(/.+/);
  const tabs = tabList.locator('button[data-business-tab-id]');
  await expect(tabs).toHaveCount(8);
  await expect(panel).toHaveAttribute('data-tab-density', 'icon');
  const tab = tabs.first();
  await expect(tab).toHaveRole('button');
  await expect(tab).toHaveAccessibleName(/.+/);
  await tab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab).toBeFocused();
  const controls = panel.locator(
    '[data-testid="business-panel-home"], [data-testid="business-panel-focus-toggle"], [data-testid="business-panel-tab-close"]',
  );
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    await expect(control).toHaveAccessibleName(/.+/);
    const box = (await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(32);
    expect(box.height).toBeGreaterThanOrEqual(32);
  }
  expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  const geometry = await panel.evaluate((element) => ({
    overflows: element.scrollWidth > element.clientWidth,
    roots: [...element.querySelectorAll<HTMLElement>('[data-surface-scroll-root]')].map((root) => ({
      name: root.dataset.surfaceScrollRoot,
      overflowY: getComputedStyle(root).overflowY,
    })),
  }));
  expect(geometry.overflows).toBe(false);
  await expect(panel.locator('[data-surface-scroll-root=business] [data-scroll-host]')).toHaveCount(
    1,
  );
  expect(geometry.roots).toEqual([
    { name: 'home', overflowY: 'hidden' },
    { name: 'business', overflowY: 'hidden' },
  ]);
  expect(
    await panel
      .getByTestId('business-panel-tab-strip')
      .evaluate((element) => getComputedStyle(element).overflowX),
  ).not.toBe('auto');
});

test('UI-9002 capsule keyboard focus and computed reduced motion', async ({ page }) => {
  const entry = matrix.find((entry) => entry.surface === 'shell.split')!;
  await openVisualCase(page, entry);
  const preview = page.getByTestId('capsule-preview-schedule');
  await expect(preview).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await preview.focus();
  await page.keyboard.press('Enter');
  const content = page.locator('[data-capsule-preview-content="schedule"]');
  await expect(content).toBeVisible();
  await expect(content).toHaveAttribute('role', 'dialog');
  expect(await content.evaluate((element) => getComputedStyle(element).animationName)).not.toBe(
    'none',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await content.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  await expect(content.getByRole('button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(content).toBeHidden();
  await expect(preview).toBeFocused();
  await expect(preview).toHaveAttribute('aria-expanded', 'false');
});
