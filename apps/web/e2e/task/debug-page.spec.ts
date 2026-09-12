import { test } from '@playwright/test';

test('Debug - Check page content', async ({ page }) => {
  const baseUrl = 'http://localhost:5173';
  const testUsername = 'Test123123';
  const testPassword = 'Llh123123!';

  // 登录
  await page.goto(`${baseUrl}/auth`);
  await page.locator('[data-testid="login-username-input"] input').fill(testUsername);
  await page.locator('[data-testid="login-password-input"] input').fill(testPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`${baseUrl}/`);
  await page.waitForTimeout(2000);

  // 导航到任务模板页面
  console.log('Navigating to /tasks...');
  await page.goto(`${baseUrl}/tasks`);
  await page.waitForTimeout(2000);

  // 截图
  await page.screenshot({ path: '/tmp/tasks-page.png', fullPage: true });
  console.log('Screenshot saved to /tmp/tasks-page.png');

  // 打印页面 HTML
  const html = await page.content();
  console.log('Page HTML length:', html.length);

  // 查找所有按钮
  const buttons = await page.locator('button').all();
  console.log(`Found ${buttons.length} buttons`);
  
  for (let i = 0; i < Math.min(buttons.length, 10); i++) {
    const btn = buttons[i];
    const text = await btn.textContent();
    const testId = await btn.getAttribute('data-testid');
    console.log(`Button ${i}: text="${text?.trim()}", data-testid="${testId}"`);
  }

  // 查找特定的 test-id
  const createBtn = page.locator('[data-testid="create-task-plan-button"]');
  const isVisible = await createBtn.isVisible().catch(() => false);
  console.log('create-task-plan-button visible:', isVisible);


  // 打印所有 data-testid 属性
  const elementsWithTestId = await page.locator('[data-testid]').all();
  console.log(`\nFound ${elementsWithTestId.length} elements with data-testid`);
  
  for (const el of elementsWithTestId.slice(0, 20)) {
    const testId = await el.getAttribute('data-testid');
    const tag = await el.evaluate(node => node.tagName);
    console.log(`  ${tag}: data-testid="${testId}"`);
  }
});
